import path from "path";
import { promises as fsPromises } from "node:fs";

export type MediaStorageDriver = "local-disk";

export type MediaAssetReadResult = {
  buffer: Buffer;
  contentType: string;
};

export type MediaStorageAdapter = {
  driver: MediaStorageDriver;
  sanitizeSegment: (value: string) => string;
  buildAssetUrl: (assetId: string, fileName: string) => string;
  persistBuffer: (assetId: string, fileName: string, buffer: Buffer) => Promise<string>;
  persistFile: (assetId: string, fileName: string, sourcePath: string) => Promise<string>;
  readAsset: (assetId: string, fileName: string) => Promise<MediaAssetReadResult | null>;
};

const getMediaContentType = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (lower.endsWith(".ts")) return "video/mp2t";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return "application/octet-stream";
};

const sanitizeMediaAssetSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "");

const buildMediaAssetUrl = (assetId: string, fileName: string) =>
  `/api/media/assets/${encodeURIComponent(assetId)}/${encodeURIComponent(fileName)}`;

const ensureAssetDir = async (rootDir: string, assetId: string) => {
  await fsPromises.mkdir(rootDir, { recursive: true });
  const normalizedAssetId = sanitizeMediaAssetSegment(assetId);
  const assetDir = path.join(rootDir, normalizedAssetId);
  await fsPromises.mkdir(assetDir, { recursive: true });
  return {
    assetDir,
    assetId: normalizedAssetId,
  };
};

const createLocalDiskMediaStorageAdapter = (rootDir: string): MediaStorageAdapter => ({
  driver: "local-disk",
  sanitizeSegment: sanitizeMediaAssetSegment,
  buildAssetUrl: buildMediaAssetUrl,
  async persistBuffer(assetId, fileName, buffer) {
    const safeFileName = sanitizeMediaAssetSegment(fileName);
    const { assetId: normalizedAssetId, assetDir } = await ensureAssetDir(rootDir, assetId);
    await fsPromises.writeFile(path.join(assetDir, safeFileName), buffer);
    return buildMediaAssetUrl(normalizedAssetId, safeFileName);
  },
  async persistFile(assetId, fileName, sourcePath) {
    const safeFileName = sanitizeMediaAssetSegment(fileName);
    const { assetId: normalizedAssetId, assetDir } = await ensureAssetDir(rootDir, assetId);
    await fsPromises.copyFile(sourcePath, path.join(assetDir, safeFileName));
    return buildMediaAssetUrl(normalizedAssetId, safeFileName);
  },
  async readAsset(assetId, fileName) {
    const normalizedAssetId = sanitizeMediaAssetSegment(assetId);
    const safeFileName = sanitizeMediaAssetSegment(fileName);
    if (!normalizedAssetId || !safeFileName) {
      return null;
    }
    try {
      const buffer = await fsPromises.readFile(
        path.join(rootDir, normalizedAssetId, safeFileName)
      );
      return {
        buffer,
        contentType: getMediaContentType(safeFileName),
      };
    } catch {
      return null;
    }
  },
});

export const createMediaStorageAdapter = (rootDir: string): MediaStorageAdapter => {
  const configuredDriver = process.env.MEDIA_STORAGE_DRIVER?.trim().toLowerCase();
  if (configuredDriver && configuredDriver !== "local-disk") {
    console.warn(
      `[mock-media] Unknown MEDIA_STORAGE_DRIVER="${configuredDriver}", fallback to local-disk`
    );
  }
  return createLocalDiskMediaStorageAdapter(rootDir);
};
