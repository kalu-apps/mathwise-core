import { Injectable } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
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
