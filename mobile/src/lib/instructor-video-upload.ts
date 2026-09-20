export const INSTRUCTOR_VIDEO_CHUNK_BYTES=4*1024*1024;
export const INSTRUCTOR_VIDEO_MAX_BYTES=200*1024*1024;
export type InstructorVideoProgress={phase:"hashing"|"uploading"|"finalizing"|"completed";percent:number};
type Receipt={id:string;status:string;received:number[];sizeBytes:number;chunkBytes:number;asset?:unknown};
export type InstructorVideoTransport={userId:number;signal:AbortSignal;hash:(bytes:Uint8Array)=>Promise<string>;uuid:()=>string;saved:(key:string,value?:string|null)=>Promise<string|null>;request:(path:string,method:string,body?:string|Uint8Array)=>Promise<unknown>;onProgress?:(value:InstructorVideoProgress)=>void};
export type InstructorVideoSource={contentType:string;sizeBytes:number;read:(offset:number,length:number)=>Promise<Uint8Array>};
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function receipt(value:unknown,size:number):Receipt {
  if(!value||typeof value!=="object")throw new Error("إيصال رفع الفيديو غير صالح");
  const v=value as Receipt;
  if(!uuidPattern.test(v.id)||v.sizeBytes!==size||v.chunkBytes!==INSTRUCTOR_VIDEO_CHUNK_BYTES||!["open","assembling","completed"].includes(v.status)||!Array.isArray(v.received)||v.received.some(i=>!Number.isSafeInteger(i)||i<0||i>=Math.ceil(size/INSTRUCTOR_VIDEO_CHUNK_BYTES))||new Set(v.received).size!==v.received.length)throw new Error("إيصال رفع الفيديو غير متسق");
  return v;
}
export async function uploadInstructorVideo(source:InstructorVideoSource,transport:InstructorVideoTransport,input:{assignmentId:number;lessonId:number;expectedRevision:number}) {
  const {signal}=transport;
  if(![input.assignmentId,input.lessonId,input.expectedRevision,transport.userId].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(source.sizeBytes)||source.sizeBytes<1||source.sizeBytes>INSTRUCTOR_VIDEO_MAX_BYTES)throw new Error("اختر فيديو لا يتجاوز 200 ميجابايت");
  if(!["video/mp4","video/webm","video/quicktime","video/x-matroska","video/x-msvideo"].includes(source.contentType))throw new Error("صيغة الفيديو غير مدعومة");
  const endpoint=`/api/instructor/assignments/${input.assignmentId}/videos`,hashes:string[]=[];
  for(let offset=0;offset<source.sizeBytes;offset+=INSTRUCTOR_VIDEO_CHUNK_BYTES){signal.throwIfAborted();const length=Math.min(INSTRUCTOR_VIDEO_CHUNK_BYTES,source.sizeBytes-offset),bytes=await source.read(offset,length);if(bytes.byteLength!==length)throw new Error("الملف المحلي غير مكتمل");hashes.push(await transport.hash(bytes));transport.onProgress?.({phase:"hashing",percent:Math.floor((offset+length)/source.sizeBytes*100)});}
  const manifest={lessonId:input.lessonId,contentType:source.contentType,sizeBytes:source.sizeBytes,hashes};
  const scope=`instructor-upload.${transport.userId}.${input.assignmentId}.${await transport.hash(new TextEncoder().encode(JSON.stringify(manifest)))}`;
  let key=await transport.saved(scope);if(!key||!uuidPattern.test(key))key=transport.uuid();await transport.saved(scope,key);
  const post=async(body:object)=>receipt(await transport.request(endpoint,"POST",JSON.stringify({...body,expectedRevision:input.expectedRevision})),source.sizeBytes);
  signal.throwIfAborted();let session:Receipt;
  try{session=await post({action:"start",...manifest,requestKey:key});}catch(error){if(signal.aborted||!(error&&typeof error==="object"&&"status" in error&&error.status===410))throw error;key=transport.uuid();await transport.saved(scope,key);session=await post({action:"start",...manifest,requestKey:key});}
  for(let index=0;session.status==="open"&&index<hashes.length;index++){
    signal.throwIfAborted();if(session.received.includes(index))continue;
    const length=Math.min(INSTRUCTOR_VIDEO_CHUNK_BYTES,source.sizeBytes-index*INSTRUCTOR_VIDEO_CHUNK_BYTES),bytes=await source.read(index*INSTRUCTOR_VIDEO_CHUNK_BYTES,length);
    if(bytes.byteLength!==length||await transport.hash(bytes)!==hashes[index])throw new Error("تغيّر الفيديو بعد تجهيز بصمته؛ أعد اختيار النسخة المطابقة");
    const next=receipt(await transport.request(`${endpoint}?id=${session.id}&part=${index}`,"PUT",bytes),source.sizeBytes);
    if(next.id!==session.id||next.status!=="open"||!next.received.includes(index)||session.received.some(part=>!next.received.includes(part)))throw new Error("إيصال أجزاء الفيديو غير متسق");
    session=next;transport.onProgress?.({phase:"uploading",percent:Math.min(99,Math.floor(session.received.reduce((sum,part)=>sum+Math.min(INSTRUCTOR_VIDEO_CHUNK_BYTES,source.sizeBytes-part*INSTRUCTOR_VIDEO_CHUNK_BYTES),0)/source.sizeBytes*100))});
  }
  signal.throwIfAborted();transport.onProgress?.({phase:"finalizing",percent:99});
  if(session.status!=="completed"){const next=await post({action:"complete",id:session.id});if(next.id!==session.id||next.status!=="completed")throw new Error("الخادم يجهز الفيديو؛ أعد اختيار الملف نفسه لاستئناف المتابعة");session=next;}
  signal.throwIfAborted();await transport.saved(scope,null);transport.onProgress?.({phase:"completed",percent:100});return session;
}
