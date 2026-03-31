export type MediaObjectState = "pending_upload" | "uploaded" | "deleted";

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

export type CompleteUploadPayloadDto = {
  etag?: string;
  sizeBytes?: number;
};

export type CompleteUploadResponseDto = {
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
