import { createCipheriv, createHmac } from "node:crypto";
/** HLS encryption protects transport/URL sharing; it is not hardware DRM. Never publish these keys. */
export function sessionMediaKey(secret: string, assetId: string | number, token: string): Buffer {
  return createHmac("sha256", secret).update(`maras:hls:key:v1:${assetId}:${token}`).digest().subarray(0,16);
}
export function mediaSegmentIv(key: Buffer, quality: string, name: string): Buffer {
  return createHmac("sha256", key).update(`maras:hls:iv:v1:${quality}:${name}`).digest().subarray(0,16);
}
export function encryptedMediaSize(size: number) { return (Math.floor(size/16)+1)*16; }
export function encryptMediaBody(body: ReadableStream<Uint8Array>, key: Buffer, iv: Buffer): ReadableStream<Uint8Array> {
  const cipher = createCipheriv("aes-128-cbc",key,iv);
  return body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(bytes,controller) { const chunk=cipher.update(bytes); if(chunk.length)controller.enqueue(new Uint8Array(chunk)); },
    flush(controller) { controller.enqueue(new Uint8Array(cipher.final())); },
  }));
}
export async function boundedManifest(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader=body.getReader(), chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw new Error("VIDEO_MANIFEST_LIMIT");chunks.push(value);}return Buffer.concat(chunks).toString("utf8");}
  finally {await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
export function manifestWithGrant(value: string, course: string, token: string, key: Buffer, quality?: string) {
  if (!value.startsWith("#EXTM3U") || value.length>2*1024*1024) throw new Error("VIDEO_MANIFEST_INVALID");
  const query=new URLSearchParams({course,token}).toString(), output:string[]=[];
  for(const row of value.split(/\r?\n/)){
    const line=row.trim();if(!line)continue;
    // The worker creates MPEG-TS playlists, never remote maps, keys or linked media.
    if(line.startsWith("#")){if(/URI\s*=|^#EXT-X-(KEY|SESSION-KEY)/i.test(line))throw new Error("VIDEO_MANIFEST_URI_INVALID");output.push(line);continue;}
    if(quality){
      if(!/^segment-[0-9]{5,7}\.ts$/.test(line))throw new Error("VIDEO_SEGMENT_INVALID");
      output.push(`#EXT-X-KEY:METHOD=AES-128,URI="../key.bin?${query}",IV=0x${mediaSegmentIv(key,quality,line).toString("hex")}`);
    }else if(!/^[0-9]{3,4}p\/index\.m3u8$/.test(line))throw new Error("VIDEO_RENDITION_INVALID");
    output.push(`${line}?${query}`);
  }
  return output.join("\n")+"\n";
}
