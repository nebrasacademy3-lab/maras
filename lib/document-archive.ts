import { deflateRawSync, inflateRawSync } from "node:zlib";

/** A deliberately small, bounded OOXML ZIP reader. Never extracts paths to disk. */
export class DocumentFormatError extends Error {
  constructor(message = "الملف غير صالح أو يتجاوز حدود القراءة الآمنة.") {
    super(message);
    this.name = "DocumentFormatError";
  }
}

const MAX_ENTRIES = 4096;
const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 16 * 1024 * 1024;
const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  table[i] = value >>> 0;
}
export function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

type Entry = { name: string; flags: number; method: number; crc: number; compressed: number; size: number; offset: number };

export function openDocumentArchive(bytes: Buffer) {
  if (bytes.length < 22 || bytes.length > 50 * 1024 * 1024) throw new DocumentFormatError();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new DocumentFormatError();
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryStart = bytes.readUInt32LE(end + 16);
  if (!count || count > MAX_ENTRIES || count !== bytes.readUInt16LE(end + 8) || directoryStart + directorySize !== end) throw new DocumentFormatError();
  const entries = new Map<string, Entry>();
  let cursor = directoryStart;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new DocumentFormatError();
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    if (cursor + 46 + nameLength + extraLength + commentLength > end || !nameLength || flags & 1 || ![0, 8].includes(method)) throw new DocumentFormatError();
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (name.includes("\\") || name.startsWith("/") || name.split("/").includes("..") || name.includes("\u0000") || entries.has(name)) throw new DocumentFormatError();
    const entry: Entry = { name, flags, method, crc: bytes.readUInt32LE(cursor + 16), compressed: bytes.readUInt32LE(cursor + 20), size: bytes.readUInt32LE(cursor + 24), offset: bytes.readUInt32LE(cursor + 42) };
    if (entry.offset + 30 > directoryStart || entry.size === 0xffffffff || entry.compressed === 0xffffffff) throw new DocumentFormatError();
    entries.set(name, entry);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end) throw new DocumentFormatError();
  let total = 0;
  const decoded = new Map<string, string>();
  return {
    names: [...entries.keys()],
    text(name: string, required = true): string {
      if (decoded.has(name)) return decoded.get(name)!;
      const entry = entries.get(name);
      if (!entry) { if (!required) return ""; throw new DocumentFormatError("الملف لا يحتوي بنية Word أو PowerPoint المتوقعة."); }
      if (entry.size > MAX_XML_BYTES || total + entry.size > MAX_TOTAL_XML_BYTES || entry.size > Math.max(1024 * 1024, entry.compressed * 250)) throw new DocumentFormatError("المحتوى المضغوط أكبر من الحد الآمن. قسّم الملف ثم أعد رفعه.");
      const offset = entry.offset;
      if (bytes.readUInt32LE(offset) !== 0x04034b50 || bytes.readUInt16LE(offset + 6) !== entry.flags || bytes.readUInt16LE(offset + 8) !== entry.method) throw new DocumentFormatError();
      const length = bytes.readUInt16LE(offset + 26);
      const extra = bytes.readUInt16LE(offset + 28);
      const start = offset + 30 + length + extra;
      if (start + entry.compressed > directoryStart || bytes.subarray(offset + 30, offset + 30 + length).toString("utf8") !== name) throw new DocumentFormatError();
      let content: Buffer;
      try {
        const compressed = bytes.subarray(start, start + entry.compressed);
        content = entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_XML_BYTES, entry.size + 1) });
      } catch { throw new DocumentFormatError(); }
      if (content.length !== entry.size || crc32(content) !== entry.crc) throw new DocumentFormatError("الملف تالف أو لم يكتمل رفعه. أعد تصديره أو رفعه.");
      total += content.length;
      let xml: string;
      try { xml = new TextDecoder("utf-8", { fatal: true }).decode(content); } catch { throw new DocumentFormatError(); }
      // XML external entities and DTDs are never evaluated or accepted.
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || xml.includes("\u0000")) throw new DocumentFormatError();
      decoded.set(name, xml);
      return xml;
    },
  };
}

/** Deterministic, UTF-8 ZIP writer for small generated documents (not user archives). */
export function createDocumentArchive(files: Record<string, string>): Buffer {
  const body: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    body.push(local, filename, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const index = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(directory.length / 2, 8); end.writeUInt16LE(directory.length / 2, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...body, index, end]);
}
