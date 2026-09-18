import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  normalizeStorageBucket,
  normalizeStorageKey,
  signedUploadTtlSeconds,
  storageEndpointUrl,
} from "@/lib/storage-policy";

type StorageConfig = {
  client: S3Client;
  bucket: string;
  endpoint: URL;
  forcePathStyle: boolean;
};

function getStorageConfig(): StorageConfig {
  const endpointValue = process.env.S3_ENDPOINT?.trim() || "";
  const bucketValue = process.env.S3_BUCKET?.trim() || "";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || "";
  if (![endpointValue, bucketValue, accessKeyId, secretAccessKey].every(Boolean)) {
    throw new Error("S3 storage is not configured");
  }
  const endpoint = storageEndpointUrl(endpointValue, {
    allowLoopbackHttp:
      process.env.NODE_ENV !== "production" &&
      process.env.S3_ALLOW_INSECURE_LOOPBACK === "true",
  });
  const bucket = normalizeStorageBucket(bucketValue);
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== "false";
  return {
    bucket,
    endpoint,
    forcePathStyle,
    client: new S3Client({
      endpoint: endpoint.toString(),
      region: process.env.S3_REGION?.trim() || "auto",
      forcePathStyle,
      maxAttempts: 3,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function isMissingObject(error: unknown) {
  const value = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    value.name === "NotFound" ||
    value.name === "NoSuchKey" ||
    value.Code === "NotFound" ||
    value.Code === "NoSuchKey" ||
    value.$metadata?.httpStatusCode === 404
  );
}

function validContentType(value: string) {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[-a-z0-9!#$&^_.+]{1,128}$/.test(value);
}

export async function createDirectUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
) {
  const { client, bucket, endpoint, forcePathStyle } = getStorageConfig();
  const normalizedKey = normalizeStorageKey(key);
  const normalizedType = contentType.trim().toLowerCase();
  if (!validContentType(normalizedType)) throw new Error("Invalid upload content type");

  const ttl = signedUploadTtlSeconds(expiresIn);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: normalizedKey,
    ContentType: normalizedType,
  });
  const signed = await getSignedUrl(client, command, {
    expiresIn: ttl,
    signableHeaders: new Set(["content-type"]),
  });
  const url = new URL(signed);
  const expectedHost = forcePathStyle
    ? endpoint.hostname
    : `${bucket}.${endpoint.hostname}`;
  if (
    url.protocol !== endpoint.protocol ||
    url.hostname !== expectedHost ||
    url.port !== endpoint.port
  ) {
    throw new Error("Unexpected signed upload destination");
  }
  const signedTtl = Number(url.searchParams.get("X-Amz-Expires"));
  if (!Number.isFinite(signedTtl) || signedTtl < 60 || signedTtl > ttl) {
    throw new Error("Invalid signed upload lifetime");
  }
  return signed;
}

export async function headDirectUpload(key: string) {
  const { client, bucket } = getStorageConfig();
  const normalizedKey = normalizeStorageKey(key);
  try {
    const object = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: normalizedKey }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    const size = Number(object.ContentLength ?? 0);
    return {
      size: Number.isSafeInteger(size) ? size : 0,
      contentType: object.ContentType || undefined,
    };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}
