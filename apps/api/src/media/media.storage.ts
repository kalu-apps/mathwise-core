import { Injectable } from "@nestjs/common";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  type CompletedPart,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getApiRuntimeConfig } from "../config/runtime.config";

@Injectable()
export class MediaStorageService {
  private readonly runtimeConfig = getApiRuntimeConfig();
  private readonly client: S3Client | null = this.runtimeConfig.mediaStorageEnabled
    ? new S3Client({
        region: this.runtimeConfig.s3Region,
        endpoint: this.runtimeConfig.s3Endpoint,
        forcePathStyle: this.runtimeConfig.s3ForcePathStyle,
        credentials: {
          accessKeyId: this.runtimeConfig.s3AccessKey,
          secretAccessKey: this.runtimeConfig.s3SecretKey,
        },
      })
    : null;

  isEnabled() {
    return this.runtimeConfig.mediaStorageEnabled;
  }

  getBucket() {
    return this.runtimeConfig.s3Bucket;
  }

  getAppEnv() {
    return this.runtimeConfig.appEnv;
  }

  async listObjectsByPrefix(params: {
    prefix: string;
    maxKeys?: number;
  }): Promise<
    Array<{
      key: string;
      size?: number;
      etag?: string;
      lastModified?: string;
    }>
  > {
    if (!this.client) return [];
    const maxKeys = Math.max(1, Math.min(500, Math.floor(params.maxKeys ?? 100)));
    const objects: Array<{
      key: string;
      size?: number;
      etag?: string;
      lastModified?: string;
    }> = [];
    let continuationToken: string | undefined;

    while (objects.length < maxKeys) {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.runtimeConfig.s3Bucket,
          Prefix: params.prefix,
          ContinuationToken: continuationToken,
          MaxKeys: Math.min(1000, maxKeys - objects.length),
        })
      );

      const pageObjects = (listed.Contents ?? []).flatMap((item) => {
        const key = item.Key?.trim();
        if (!key) return [];
        return [
          {
            key,
            size: typeof item.Size === "number" ? item.Size : undefined,
            etag: item.ETag?.trim() || undefined,
            lastModified: item.LastModified?.toISOString(),
          },
        ];
      });

      objects.push(...pageObjects);

      if (!listed.IsTruncated || !listed.NextContinuationToken) {
        break;
      }
      continuationToken = listed.NextContinuationToken;
    }

    return objects.slice(0, maxKeys);
  }

  async healthcheck(): Promise<boolean> {
    if (!this.client) return true;
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.runtimeConfig.s3Bucket,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async createSignedUploadUrl(params: {
    objectKey: string;
    contentType: string;
    expiresInSec?: number;
  }): Promise<{ url: string; expiresAt: string }> {
    if (!this.client) {
      throw new Error("Media storage is disabled");
    }
    const expiresIn = Math.max(
      60,
      Math.floor(params.expiresInSec ?? this.runtimeConfig.mediaSignedUrlTtlSec)
    );
    const command = new PutObjectCommand({
      Bucket: this.runtimeConfig.s3Bucket,
      Key: params.objectKey,
      ContentType: params.contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async createSignedDownloadUrl(params: {
    objectKey: string;
    expiresInSec?: number;
  }): Promise<{ url: string; expiresAt: string }> {
    if (!this.client) {
      throw new Error("Media storage is disabled");
    }
    const expiresIn = Math.max(
      60,
      Math.floor(params.expiresInSec ?? this.runtimeConfig.mediaSignedUrlTtlSec)
    );
    const command = new GetObjectCommand({
      Bucket: this.runtimeConfig.s3Bucket,
      Key: params.objectKey,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async createMultipartUpload(params: {
    objectKey: string;
    contentType: string;
  }): Promise<{ uploadId: string }> {
    if (!this.client) {
      throw new Error("Media storage is disabled");
    }
    const created = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.runtimeConfig.s3Bucket,
        Key: params.objectKey,
        ContentType: params.contentType,
      })
    );
    const uploadId = created.UploadId?.trim();
    if (!uploadId) {
      throw new Error("media_multipart_upload_id_missing");
    }
    return { uploadId };
  }

  async createSignedUploadPartUrl(params: {
    objectKey: string;
    uploadId: string;
    partNumber: number;
    expiresInSec?: number;
  }): Promise<{ url: string; expiresAt: string }> {
    if (!this.client) {
      throw new Error("Media storage is disabled");
    }
    const expiresIn = Math.max(
      60,
      Math.floor(params.expiresInSec ?? this.runtimeConfig.mediaSignedUrlTtlSec)
    );
    const command = new UploadPartCommand({
      Bucket: this.runtimeConfig.s3Bucket,
      Key: params.objectKey,
      UploadId: params.uploadId,
      PartNumber: params.partNumber,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn });
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async listMultipartUploadedParts(params: {
    objectKey: string;
    uploadId: string;
  }): Promise<Array<{ partNumber: number; etag: string }>> {
    if (!this.client) {
      throw new Error("Media storage is disabled");
    }
    const listed = await this.client.send(
      new ListPartsCommand({
        Bucket: this.runtimeConfig.s3Bucket,
        Key: params.objectKey,
        UploadId: params.uploadId,
      })
    );
    const parts = listed.Parts ?? [];
    return parts
      .map((part) => {
        const partNumber = part.PartNumber ?? 0;
        const etag = part.ETag?.trim();
        if (!partNumber || !etag) return null;
        return { partNumber, etag };
      })
      .filter((part): part is { partNumber: number; etag: string } =>
        Boolean(part)
      )
      .sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipartUpload(params: {
    objectKey: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  }): Promise<void> {
    if (!this.client) {
      throw new Error("Media storage is disabled");
    }
    const completedParts: CompletedPart[] = params.parts.map((part) => ({
      ETag: part.etag,
      PartNumber: part.partNumber,
    }));
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.runtimeConfig.s3Bucket,
        Key: params.objectKey,
        UploadId: params.uploadId,
        MultipartUpload: {
          Parts: completedParts,
        },
      })
    );
  }

  async abortMultipartUpload(params: {
    objectKey: string;
    uploadId: string;
  }): Promise<void> {
    if (!this.client) {
      throw new Error("Media storage is disabled");
    }
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.runtimeConfig.s3Bucket,
        Key: params.objectKey,
        UploadId: params.uploadId,
      })
    );
  }

  async headObject(objectKey: string): Promise<{
    contentLength?: number;
    etag?: string;
    contentType?: string;
  } | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.runtimeConfig.s3Bucket,
          Key: objectKey,
        })
      );
      return {
        contentLength:
          typeof result.ContentLength === "number" ? result.ContentLength : undefined,
        etag: result.ETag ?? undefined,
        contentType: result.ContentType ?? undefined,
      };
    } catch {
      return null;
    }
  }

  async deleteObject(objectKey: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.runtimeConfig.s3Bucket,
          Key: objectKey,
        })
      );
      return true;
    } catch {
      return false;
    }
  }
}
