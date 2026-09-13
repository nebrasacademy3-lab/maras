import { createHash, createHmac } from "node:crypto";

type S3Config = {
  endpoint: URL;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

function getConfig(): S3Config {
  const endpointValue = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!endpointValue || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 storage is not configured");
  }

  const endpoint = new URL(endpointValue);

  return {
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function objectUrl(config: S3Config, key: string) {
  const url = new URL(config.endpoint.toString());
  const endpointPath = url.pathname.replace(/\/$/, "");
  const encodedKey = key.split("/").map(encode).join("/");

  if (config.forcePathStyle) {
    url.pathname = `${endpointPath}/${encode(config.bucket)}/${encodedKey}`;
  } else {
    url.hostname = `${config.bucket}.${url.hostname}`;
    url.pathname = `${endpointPath}/${encodedKey}`;
  }

  return url;
}

function signHeaders(
  config: S3Config,
  method: string,
  url: URL,
  payloadHash: string,
) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${config.region}/s3/aws4_request`;

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${headers[name].replace(/\s+/g, " ")}\n`)
    .join("");

  const canonicalRequest = [
    method,
    url.pathname || "/",
    "",
    canonicalHeaders,
    names.join(";"),
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hash(canonicalRequest),
  ].join("\n");

  const dateKey = hmac(`AWS4${config.secretAccessKey}`, date);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

export function createDirectUploadUrl(key: string, expiresIn = 900) {
  const config = getConfig();
  const url = objectUrl(config, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${config.region}/s3/aws4_request`;

  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${config.accessKeyId}/${scope}`);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(Math.min(expiresIn, 900)));
  url.searchParams.set("X-Amz-SignedHeaders", "host");

  const query = [...url.searchParams.entries()]
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
    .map(([name, value]) => `${encode(name)}=${encode(value)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    url.pathname || "/",
    query,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    hash(canonicalRequest),
  ].join("\n");

  const dateKey = hmac(`AWS4${config.secretAccessKey}`, date);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  url.searchParams.set("X-Amz-Signature", signature);

  return url.toString();
}

export async function headDirectUpload(key: string) {
  const config = getConfig();
  const url = objectUrl(config, key);
  const headers = signHeaders(config, "HEAD", url, hash(""));

  const response = await fetch(url, {
    method: "HEAD",
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 404) return null;
  if (!response.ok) return null;

  const size = Number(response.headers.get("content-length"));

  return {
    size: Number.isSafeInteger(size) ? size : 0,
    contentType: response.headers.get("content-type") || undefined,
  };
}