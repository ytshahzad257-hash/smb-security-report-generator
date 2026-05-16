"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function formatTimeAgo(value: string) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "now";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays}d ago`;
}

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const computedUnreadCount = useMemo(() => {
    return notifications.length > 0
      ? notifications.filter((notification) => !notification.readAt).length
      : unreadCount;
  }, [notifications, unreadCount]);

  const fetchUnreadCount = useCallback(async () => {
    const response = await fetch("/api/notifications/unread-count", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error("Unread count failed");
    }

    const payload = (await response.json()) as { unreadCount?: number };
    setUnreadCount(typeof payload.unreadCount === "number" ? payload.unreadCount : 0);
  }, []);

  const fetchNotifications = useCallback(async () => {
    const response = await fetch("/api/notifications?limit=20", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error("Notifications request failed");
    }

    const payload = (await response.json()) as { notifications?: NotificationItem[] };
    const list = Array.isArray(payload.notifications) ? payload.notifications : [];

    setNotifications(list);
    setUnreadCount(list.filter((notification) => !notification.readAt).length);
  }, []);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([fetchUnreadCount(), fetchNotifications()]);
    } catch {
      setError("Notifications are unavailable right now.");
    }
  }, [fetchNotifications, fetchUnreadCount]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      return;
    }

    setError(null);
    setIsLoading(true);

    void refresh().finally(() => {
      setIsLoading(false);
    });
  }

  async function handleMarkAllRead() {
    setIsMutating(true);
    setError(null);

    const snapshot = notifications;
    const snapshotUnread = unreadCount;

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? new Date().toISOString(),
      })),
    );
    setUnreadCount(0);

    try {
      const response = await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("mark all failed");
      }
    } catch {
      setNotifications(snapshot);
      setUnreadCount(snapshotUnread);
      setError("Could not mark all notifications as read.");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleNotificationClick(notification: NotificationItem) {
    setIsMutating(true);
    setError(null);

    const snapshot = notifications;
    const snapshotUnread = unreadCount;

    if (!notification.readAt) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    }

    try {
      if (!notification.readAt) {
        const response = await fetch(`/api/notifications/${notification.id}/read`, {
          method: "POST",
          credentials: "same-origin",
        });

        if (!response.ok) {
          throw new Error("mark read failed");
        }
      }

      if (notification.href) {
        setOpen(false);
        router.push(notification.href);
      }
    } catch {
      setNotifications(snapshot);
      setUnreadCount(snapshotUnread);
      setError("Could not update this notification.");
    } finally {
      setIsMutating(false);
    }
  }

  function primeUnreadCount() {
    if (isLoading || notifications.length > 0) {
      return;
    }

    void fetchUnreadCount().catch(() => undefined);
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Notifications"
          className="relative"
          onFocus={primeUnreadCount}
          onPointerEnter={primeUnreadCount}
        >
          {isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Bell aria-hidden="true" />}
          {computedUnreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
              {computedUnreadCount > 99 ? "99+" : computedUnreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[22rem] p-0" sideOffset={10}>
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            <p className="text-xs text-muted-foreground">Unread: {computedUnreadCount}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isMutating || computedUnreadCount === 0}
          >
            <CheckCheck aria-hidden="true" />
            Mark all read
          </Button>
        </div>

        <div className="max-h-[24rem] overflow-y-auto p-2">
          {isLoading ? (
            <div className="rounded-md border border-border px-3 py-6 text-sm text-muted-foreground">
              Loading notifications...
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-md border border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="grid gap-1">
              {notifications.map((notification) => {
                const unread = !notification.readAt;

                return (
                  <button
                    type="button"
                    key={notification.id}
                    className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted"
                    onClick={() => void handleNotificationClick(notification)}
                    disabled={isMutating}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{notification.title}</p>
                      {unread ? (
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread notification" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{notification.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatTimeAgo(notification.createdAt)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button asChild type="button" variant="ghost" className="w-full justify-start">
            <Link href="/dashboard/settings/notifications" onClick={() => setOpen(false)}>
              Notification settings
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { NotificationBell };
