import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { env } from "../config/env";

export const PRESIGN_TTL_SECONDS = 600;

@Injectable()
export class StorageService {
  /** Talks to storage over the internal network (server-side operations). */
  private readonly internalClient = this.createClient(env.S3_ENDPOINT);
  /** Signs URLs against the endpoint the BROWSER can reach. */
  private readonly publicClient = this.createClient(env.S3_PUBLIC_ENDPOINT);

  presignUpload(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType });
    return getSignedUrl(this.publicClient, command, { expiresIn: PRESIGN_TTL_SECONDS });
  }

  presignDownload(key: string, fileName: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    });
    return getSignedUrl(this.publicClient, command, { expiresIn: PRESIGN_TTL_SECONDS });
  }

  async deleteObject(key: string): Promise<void> {
    await this.internalClient.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }

  private createClient(endpoint: string): S3Client {
    return new S3Client({
      endpoint,
      region: env.S3_REGION,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      // Minio serves buckets by path, not subdomain.
      forcePathStyle: true,
    });
  }
}
