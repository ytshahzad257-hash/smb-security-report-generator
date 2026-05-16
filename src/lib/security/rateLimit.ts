import { createHash, randomUUID } from "node:crypto";
import type { Redis } from "ioredis";

import type { RateLimitRule } from "./limits.ts";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter: number;
  source: "redis" | "memory" | "unavailable";
};

export type RateLimitInput = RateLimitRule & {
  key: string;
  cost?: number;
  now?: Date;
};

export type RateLimitKeyInput = {
  action: string;
  ip?: string | null;
  route?: string | null;
  scope?: string | null;
  target?: string | null;
  userId?: string | null;
};

type MemoryFixedCounter = {
  count: number;
  resetAt: number;
};

type MemorySlidingCounter = {
  events: number[];
  lockUntil?: number;
};

type RedisConstructor = new (
  url: string,
  options: {
    connectTimeout: number;
    enableOfflineQueue: boolean;
    lazyConnect: boolean;
    maxRetriesPerRequest: number;
    retryStrategy: () => null;
  },
) => Redis;

const REDIS_BACKOFF_MS = 30_000;

const globalForRateLimit = globalThis as unknown as {
  rateLimitFixedMemory?: Map<string, MemoryFixedCounter>;
  rateLimitRedis?: Redis;
  rateLimitRedisUnavailableUntil?: number;
  rateLimitSlidingMemory?: Map<string, MemorySlidingCounter>;
};

function getFixedMemory() {
  const store = globalForRateLimit.rateLimitFixedMemory ?? new Map();
  globalForRateLimit.rateLimitFixedMemory = store;
  return store;
}

function getSlidingMemory() {
  const store = globalForRateLimit.rateLimitSlidingMemory ?? new Map();
  globalForRateLimit.rateLimitSlidingMemory = store;
  return store;
}

export function resetMemoryRateLimitsForTests() {
  globalForRateLimit.rateLimitFixedMemory?.clear();
  globalForRateLimit.rateLimitSlidingMemory?.clear();
}

export function hashRateLimitPart(value: string) {
  return createHash("sha256").update(value).digest("base64url").slice(0, 32);
}

function safeKeyPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").slice(0, 80);
}

export function createRateLimitKey(input: RateLimitKeyInput) {
  return [
    "smb",
    "rl",
    "v1",
    safeKeyPart(input.action),
    input.scope ? safeKeyPart(input.scope) : "default",
    input.route ? `route:${hashRateLimitPart(input.route)}` : "route:none",
    input.userId ? `user:${hashRateLimitPart(input.userId)}` : "user:anon",
    input.ip ? `ip:${hashRateLimitPart(input.ip)}` : "ip:none",
    input.target ? `target:${hashRateLimitPart(input.target)}` : "target:none",
  ].join(":");
}

export function getClientIpFromHeaders(headers: Pick<Headers, "get">) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  const value = forwardedFor || realIp || cfIp || null;

  return value?.replace(/[^a-zA-Z0-9:.%-]/g, "").slice(0, 80) || null;
}

export function getUserAgentFromHeaders(headers: Pick<Headers, "get">) {
  return headers.get("user-agent")?.replace(/[\r\n\t]+/g, " ").slice(0, 300) ?? null;
}

export async function getRequestContext(request?: Request) {
  const headerList = request
    ? request.headers
    : await import("next/headers.js").then((mod) => mod.headers());

  return {
    ip: getClientIpFromHeaders(headerList),
    userAgent: getUserAgentFromHeaders(headerList),
  };
}

function isLocalDevFallbackAllowed() {
  return process.env.NODE_ENV !== "production";
}

async function createRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    return null;
  }

  const now = Date.now();

  if ((globalForRateLimit.rateLimitRedisUnavailableUntil ?? 0) > now) {
    return null;
  }

  const existing = globalForRateLimit.rateLimitRedis;

  if (existing?.status === "ready") {
    return existing;
  }

  try {
    const RedisClient = (await import("ioredis")).default as RedisConstructor;
    const redis = new RedisClient(redisUrl, {
      connectTimeout: 750,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    redis.on("error", () => undefined);
    await redis.connect();
    await redis.ping();

    globalForRateLimit.rateLimitRedis = redis;
    return redis;
  } catch {
    globalForRateLimit.rateLimitRedisUnavailableUntil = now + REDIS_BACKOFF_MS;
    await existing?.quit().catch(() => undefined);
    globalForRateLimit.rateLimitRedis = undefined;
    return null;
  }
}

function buildResult(input: {
  allowed: boolean;
  count: number;
  limit: number;
  resetAtMs: number;
  source: RateLimitResult["source"];
}) {
  const retryAfter = Math.max(
    0,
    Math.ceil((input.resetAtMs - Date.now()) / 1000),
  );

  return {
    allowed: input.allowed,
    limit: input.limit,
    remaining: Math.max(0, input.limit - input.count),
    resetAt: new Date(input.resetAtMs),
    retryAfter,
    source: input.source,
  } satisfies RateLimitResult;
}

async function checkRedisFixedWindow(
  redis: Redis,
  input: Required<Pick<RateLimitInput, "cost" | "key" | "limit" | "windowMs">> & {
    nowMs: number;
  },
) {
  const windowStart = Math.floor(input.nowMs / input.windowMs) * input.windowMs;
  const resetAtMs = windowStart + input.windowMs;
  const redisKey = `${input.key}:fixed:${windowStart}`;
  const count = await redis.incrby(redisKey, input.cost);

  if (count === input.cost) {
    await redis.pexpire(redisKey, Math.max(1, resetAtMs - input.nowMs));
  }

  return buildResult({
    allowed: count <= input.limit,
    count,
    limit: input.limit,
    resetAtMs,
    source: "redis",
  });
}

async function checkRedisSlidingWindow(
  redis: Redis,
  input: Required<Pick<RateLimitInput, "cost" | "key" | "limit" | "windowMs">> & {
    lockoutMs?: number;
    nowMs: number;
  },
) {
  const lockKey = `${input.key}:lock`;
  const lockTtl = await redis.pttl(lockKey);

  if (lockTtl > 0) {
    return buildResult({
      allowed: false,
      count: input.limit,
      limit: input.limit,
      resetAtMs: input.nowMs + lockTtl,
      source: "redis",
    });
  }

  const minScore = input.nowMs - input.windowMs;
  const multi = redis.multi();

  multi.zremrangebyscore(input.key, 0, minScore);

  for (let index = 0; index < input.cost; index += 1) {
    multi.zadd(input.key, input.nowMs, `${input.nowMs}:${randomUUID()}:${index}`);
  }

  multi.zcard(input.key);
  multi.pexpire(input.key, input.windowMs);

  const results = await multi.exec();
  const zcardResult = results?.[1 + input.cost]?.[1];
  const count = typeof zcardResult === "number" ? zcardResult : Number(zcardResult ?? 0);
  const blocked = count > input.limit;
  const resetAtMs = blocked && input.lockoutMs
    ? input.nowMs + input.lockoutMs
    : input.nowMs + input.windowMs;

  if (blocked && input.lockoutMs) {
    await redis.psetex(lockKey, input.lockoutMs, "1");
  }

  return buildResult({
    allowed: !blocked,
    count,
    limit: input.limit,
    resetAtMs,
    source: "redis",
  });
}

function checkMemoryFixedWindow(input: Required<
  Pick<RateLimitInput, "cost" | "key" | "limit" | "windowMs">
> & { nowMs: number }) {
  const windowStart = Math.floor(input.nowMs / input.windowMs) * input.windowMs;
  const memoryKey = `${input.key}:fixed:${windowStart}`;
  const resetAtMs = windowStart + input.windowMs;
  const store = getFixedMemory();
  const current = store.get(memoryKey);
  const nextCount = (current && current.resetAt > input.nowMs ? current.count : 0) + input.cost;

  store.set(memoryKey, {
    count: nextCount,
    resetAt: resetAtMs,
  });

  return buildResult({
    allowed: nextCount <= input.limit,
    count: nextCount,
    limit: input.limit,
    resetAtMs,
    source: "memory",
  });
}

function checkMemorySlidingWindow(input: Required<
  Pick<RateLimitInput, "cost" | "key" | "limit" | "windowMs">
> & {
  lockoutMs?: number;
  nowMs: number;
}) {
  const store = getSlidingMemory();
  const current: MemorySlidingCounter = store.get(input.key) ?? { events: [] };

  if (current.lockUntil && current.lockUntil > input.nowMs) {
    return buildResult({
      allowed: false,
      count: input.limit,
      limit: input.limit,
      resetAtMs: current.lockUntil,
      source: "memory",
    });
  }

  const cutoff = input.nowMs - input.windowMs;
  const events = current.events.filter((event: number) => event > cutoff);

  for (let index = 0; index < input.cost; index += 1) {
    events.push(input.nowMs);
  }

  const blocked = events.length > input.limit;
  const resetAtMs =
    blocked && input.lockoutMs
      ? input.nowMs + input.lockoutMs
      : (events[0] ?? input.nowMs) + input.windowMs;

  store.set(input.key, {
    events,
    lockUntil: blocked && input.lockoutMs ? resetAtMs : undefined,
  });

  return buildResult({
    allowed: !blocked,
    count: events.length,
    limit: input.limit,
    resetAtMs,
    source: "memory",
  });
}

export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const nowMs = input.now?.getTime() ?? Date.now();
  const cost = Math.max(1, input.cost ?? 1);
  const normalized = {
    cost,
    key: input.key,
    limit: Math.max(0, input.limit),
    lockoutMs: input.lockoutMs,
    mode: input.mode,
    nowMs,
    windowMs: Math.max(1, input.windowMs),
  };

  if (normalized.limit <= 0) {
    return buildResult({
      allowed: false,
      count: 1,
      limit: 0,
      resetAtMs: nowMs + normalized.windowMs,
      source: "memory",
    });
  }

  const redis = await createRedisClient();

  if (redis) {
    return normalized.mode === "fixed"
      ? checkRedisFixedWindow(redis, normalized)
      : checkRedisSlidingWindow(redis, normalized);
  }

  if (!isLocalDevFallbackAllowed()) {
    return buildResult({
      allowed: false,
      count: normalized.limit + cost,
      limit: normalized.limit,
      resetAtMs: nowMs + normalized.windowMs,
      source: "unavailable",
    });
  }

  return normalized.mode === "fixed"
    ? checkMemoryFixedWindow(normalized)
    : checkMemorySlidingWindow(normalized);
}

export function rateLimitResponseHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfter),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}

export async function getRateLimiterHealth() {
  const configured = Boolean(process.env.REDIS_URL?.trim());
  const redis = await createRedisClient();

  return {
    rateLimiterRedisConfigured: configured,
    rateLimiterRedisConnected: Boolean(redis && redis.status === "ready"),
    rateLimiterInMemoryFallback:
      !redis && isLocalDevFallbackAllowed(),
    rateLimiterFailClosed:
      !redis && !isLocalDevFallbackAllowed(),
  };
}
