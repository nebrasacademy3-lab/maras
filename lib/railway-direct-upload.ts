import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type StorageConfig = {
  client: S3Client;
  bucket: string;
};

function getStorageConfig(): StorageConfig {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 storage is not configured");
  }

  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: process.env.S3_REGION?.trim() || "auto",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      maxAttempts: 3,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };
}

function isMissingObject(error: unknown) {
  const value = error as {
    name?: string;
    Code?: string;
    $metadata?: {
      httpStatusCode?: number;
    };
  };

  return (
    value.name === "NotFound" ||
    value.name === "NoSuchKey" ||
    value.Code === "NotFound" ||
    value.Code === "NoSuchKey" ||
    value.$metadata?.httpStatusCode === 404
  );
}

export async function createDirectUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
) {
  const { client, bucket } = getStorageConfig();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, {
    expiresIn: Math.min(Math.max(expiresIn, 60), 900),
    signableHeaders: new Set(["content-type"]),
  });
}

export async function headDirectUpload(key: string) {
  const { client, bucket } = getStorageConfig();

  try {
    const object = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const size = Number(object.ContentLength ?? 0);

    return {
      size: Number.isSafeInteger(size) ? size : 0,
      contentType: object.ContentType || undefined,
    };
  } catch (error) {
    if (isMissingObject(error)) {
      return null;
    }

    throw error;
  }
}