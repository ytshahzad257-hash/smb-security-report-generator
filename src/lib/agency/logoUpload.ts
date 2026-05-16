import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";

const allowedLogoTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

const maxLogoBytes = 2 * 1024 * 1024;
export const AGENCY_ASSETS_PUBLIC_DIR = path.join(process.cwd(), "public", "agency-assets");

function isSafeUserId(userId: string) {
  return /^[a-zA-Z0-9_-]+$/.test(userId);
}

export function isPathInsideAgencyAssets(filePath: string) {
  const assetsDir = path.resolve(AGENCY_ASSETS_PUBLIC_DIR);
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(assetsDir, resolvedPath);

  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function getLogoMimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return null;
}

export function validateLogoFile(file: File | null) {
  if (!file) {
    return { error: "Logo file is required.", success: false as const };
  }

  const extension = allowedLogoTypes.get(file.type);

  if (!extension) {
    return {
      error: "Logo must be a PNG, JPG, JPEG, or WebP image.",
      success: false as const,
    };
  }

  if (file.size > maxLogoBytes) {
    return {
      error: "Logo must be 2 MB or smaller.",
      success: false as const,
    };
  }

  return { extension, success: true as const };
}

export async function saveAgencyLogo(userId: string, file: File | null) {
  if (!isSafeUserId(userId)) {
    return { error: "Invalid user identifier.", status: 400, success: false as const };
  }

  if (!file) {
    return { error: "Logo file is required.", status: 400, success: false as const };
  }

  const validation = validateLogoFile(file);

  if (!validation.success) {
    return { error: validation.error, status: 400, success: false as const };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.byteLength > maxLogoBytes) {
    return { error: "Logo must be 2 MB or smaller.", status: 400, success: false as const };
  }

  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const existing = await prisma.agencyProfile.findUnique({
    select: { logoPath: true },
    where: { userId },
  });
  const userDir = path.join(AGENCY_ASSETS_PUBLIC_DIR, userId);
  const fileName = `logo-${Date.now()}.${validation.extension}`;
  const logoPath = path.join(userDir, fileName);

  if (!isPathInsideAgencyAssets(logoPath)) {
    return { error: "Logo path is invalid.", status: 400, success: false as const };
  }

  await mkdir(userDir, { recursive: true });
  await writeFile(logoPath, buffer, { flag: "wx" });
  await stat(logoPath);

  const logoUrl = `/agency-assets/${userId}/${fileName}`;

  try {
    const profile = await prisma.agencyProfile.update({
      data: {
        logoPath,
        logoUrl,
      },
      where: { userId },
    });

    if (existing?.logoPath && isPathInsideAgencyAssets(existing.logoPath)) {
      await unlink(existing.logoPath).catch(() => undefined);
    }

    return { logoUrl: profile.logoUrl, success: true as const };
  } catch (error) {
    await unlink(logoPath).catch(() => undefined);
    throw error;
  }
}

export async function getAgencyLogoDataUri(logoPath: string | null) {
  if (!logoPath || !isPathInsideAgencyAssets(logoPath)) {
    return null;
  }

  const mimeType = getLogoMimeTypeFromPath(logoPath);

  if (!mimeType) {
    return null;
  }

  try {
    const fileStats = await stat(logoPath);

    if (!fileStats.isFile() || fileStats.size <= 0 || fileStats.size > maxLogoBytes) {
      return null;
    }

    const logo = await readFile(logoPath);

    if (logo.byteLength <= 0 || logo.byteLength > maxLogoBytes) {
      return null;
    }

    return `data:${mimeType};base64,${logo.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function deleteAgencyLogo(userId: string) {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const profile = await prisma.agencyProfile.findUnique({
    select: { logoPath: true },
    where: { userId },
  });

  const logoPath = profile?.logoPath;

  if (logoPath && isPathInsideAgencyAssets(logoPath)) {
    await stat(logoPath)
      .then(() => unlink(logoPath))
      .catch(() => undefined);
  }

  await prisma.agencyProfile.update({
    data: {
      logoPath: null,
      logoUrl: null,
    },
    where: { userId },
  });

  return { success: true as const };
}
