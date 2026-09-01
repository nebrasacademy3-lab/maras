import "server-only";

import { getObject, type StorageProvider } from "@/lib/storage";

const MAX_PROBE_BYTES = 8 * 1024 * 1024;

function uint32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return 0;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function uint64(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 8 > bytes.length) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  const value = view.getBigUint64(0, false);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : 0;
}

function findSequence(bytes: Uint8Array, sequence: number[], from = 0) {
  outer: for (let index = Math.max(0, from); index <= bytes.length - sequence.length; index += 1) {
    for (let offset = 0; offset < sequence.length; offset += 1) if (bytes[index + offset] !== sequence[offset]) continue outer;
    return index;
  }
  return -1;
}

function mp4Duration(bytes: Uint8Array) {
  let cursor = 0;
  while (cursor < bytes.length) {
    const marker = findSequence(bytes, [0x6d, 0x76, 0x68, 0x64], cursor); // mvhd
    if (marker < 0) break;
    const version = bytes[marker + 4];
    const timescale = version === 1 ? uint32(bytes, marker + 24) : uint32(bytes, marker + 16);
    const units = version === 1 ? uint64(bytes, marker + 28) : uint32(bytes, marker + 20);
    const seconds = timescale > 0 ? units / timescale : 0;
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
    cursor = marker + 4;
  }
  return 0;
}

function aviDuration(bytes: Uint8Array) {
  const marker = findSequence(bytes, [0x61, 0x76, 0x69, 0x68]); // avih
  if (marker < 0 || marker + 28 > bytes.length) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const microsecondsPerFrame = view.getUint32(marker + 8, true);
  const totalFrames = view.getUint32(marker + 24, true);
  const seconds = microsecondsPerFrame * totalFrames / 1_000_000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function readEbmlVint(bytes: Uint8Array, offset: number) {
  const first = bytes[offset];
  if (!first) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && (first & marker) === 0) { marker >>= 1; length += 1; }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = first & (marker - 1);
  for (let index = 1; index < length; index += 1) value = value * 256 + bytes[offset + index];
  return { length, value };
}

function webmDuration(bytes: Uint8Array) {
  const durationMarker = findSequence(bytes, [0x44, 0x89]);
  if (durationMarker < 0) return 0;
  const size = readEbmlVint(bytes, durationMarker + 2);
  if (!size || (size.value !== 4 && size.value !== 8)) return 0;
  const valueOffset = durationMarker + 2 + size.length;
  if (valueOffset + size.value > bytes.length) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset + valueOffset, size.value);
  const durationUnits = size.value === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
  const scaleMarker = findSequence(bytes, [0x2a, 0xd7, 0xb1]);
  let timecodeScale = 1_000_000;
  if (scaleMarker >= 0) {
    const scaleSize = readEbmlVint(bytes, scaleMarker + 3);
    if (scaleSize && scaleSize.value > 0 && scaleSize.value <= 8) {
      let parsed = 0;
      const start = scaleMarker + 3 + scaleSize.length;
      for (let index = 0; index < scaleSize.value && start + index < bytes.length; index += 1) parsed = parsed * 256 + bytes[start + index];
      if (parsed > 0) timecodeScale = parsed;
    }
  }
  const seconds = durationUnits * timecodeScale / 1_000_000_000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function detectVideoDuration(bytes: Uint8Array, contentType: string) {
  if (contentType === "video/mp4" || contentType === "video/quicktime") return mp4Duration(bytes);
  if (contentType === "video/webm" || contentType === "video/x-matroska") return webmDuration(bytes);
  if (contentType === "video/x-msvideo") return aviDuration(bytes);
  return 0;
}

async function readRange(objectKey: string, offset: number, length: number, provider?: StorageProvider) {
  const object = await getObject(objectKey, { offset, length }, provider);
  if (!object) return new Uint8Array();
  return new Uint8Array(await new Response(object.body as BodyInit).arrayBuffer());
}

export async function probeStoredVideoDuration(objectKey: string, sizeBytes: number, contentType: string, provider?: StorageProvider) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return 0;
  const firstLength = Math.min(sizeBytes, MAX_PROBE_BYTES);
  const first = await readRange(objectKey, 0, firstLength, provider);
  let seconds = detectVideoDuration(first, contentType);
  if (!seconds && (contentType === "video/mp4" || contentType === "video/quicktime") && sizeBytes > firstLength) {
    const tailLength = Math.min(sizeBytes, MAX_PROBE_BYTES);
    const tail = await readRange(objectKey, sizeBytes - tailLength, tailLength, provider);
    seconds = detectVideoDuration(tail, contentType);
  }
  return seconds > 0 && seconds < 7 * 24 * 60 * 60 ? Math.max(1, Math.round(seconds)) : 0;
}
