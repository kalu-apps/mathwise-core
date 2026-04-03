export type MediaObjectState =
  | "pending_upload"
  | "uploaded"
  | "orphan_candidate"
  | "cleanup_pending"
  | "upload_failed"
  | "deleted";

export type MediaObjectRecord = {
  id: string;
  objectKey: string;
  bucket: string;
  ownerUserId: string;
  category: string;
  contentType: string;
  sizeBytes?: number;
  etag?: string;
  state: MediaObjectState;
  createdAt: string;
  updatedAt: string;
};

export type CreateUploadUrlPayloadDto = {
  fileName: string;
  contentType: string;
  sizeBytes?: number;
  category?: string;
};

export type CreateUploadUrlResponseDto = {
  objectId: string;
  objectKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export type CreateMultipartUploadPayloadDto = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  category?: string;
};

export type CreateMultipartUploadResponseDto = {
  objectId: string;
  objectKey: string;
  uploadId: string;
  partSizeBytes: number;
  partCount: number;
  parts: Array<{
    partNumber: number;
    uploadUrl: string;
    expiresAt: string;
    method: "PUT";
  }>;
};

export type CompleteUploadPayloadDto = {
  etag?: string;
  sizeBytes?: number;
};

export type CompleteUploadResponseDto = {
  ok: true;
  media: MediaObjectRecord;
};

export type CompleteMultipartUploadPayloadDto = {
  uploadId: string;
  partCount: number;
  sizeBytes?: number;
};

export type CompleteMultipartUploadResponseDto = {
  ok: true;
  media: MediaObjectRecord;
};

export type AbortMultipartUploadPayloadDto = {
  uploadId: string;
};

export type AbortMultipartUploadResponseDto = {
  ok: true;
  media: MediaObjectRecord;
};

export type MarkFinalizeFailedResponseDto = {
  ok: true;
  media: MediaObjectRecord;
};

export type GetDownloadUrlResponseDto = {
  objectId: string;
  objectKey: string;
  downloadUrl: string;
  expiresAt: string;
  contentType: string;
  sizeBytes?: number;
};
