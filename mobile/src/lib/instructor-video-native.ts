import * as Crypto from "expo-crypto";
import {File} from "expo-file-system";
import {Platform} from "react-native";
import type {DocumentPickerAsset} from "expo-document-picker";
import {api,getApiToken} from "@/src/lib/api";
import {assetMimeType} from "@/src/lib/file-types";
import {savedStudyJob} from "@/src/lib/study-jobs";
import {uploadInstructorVideo,type InstructorVideoProgress} from "@/src/lib/instructor-video-upload";
export async function uploadNativeInstructorVideo(asset:DocumentPickerAsset,input:{userId:number;assignmentId:number;lessonId:number;expectedRevision:number;signal:AbortSignal;onProgress:(value:InstructorVideoProgress)=>void}) {
  const token=getApiToken(),local=Platform.OS==="web"?null:new File(asset.uri),sizeBytes=local?local.size:asset.file?.size||asset.size||0;
  const active=()=>{input.signal.throwIfAborted();if(token!==getApiToken())throw new Error("تغيّر الحساب أثناء الرفع");};
  const mime=assetMimeType(asset,"application/octet-stream");
  return uploadInstructorVideo({contentType:mime,sizeBytes,read:async(offset,length)=>{active();if(!local){if(!asset.file)throw new Error("أعد اختيار الفيديو المحلي");return new Uint8Array(await asset.file.slice(offset,offset+length).arrayBuffer());}if(!local.exists||local.size!==sizeBytes)throw new Error("تغيّر الفيديو المحلي");const handle=local.open();try{handle.offset=offset;return handle.readBytes(length);}finally{handle.close();}}},{userId:input.userId,signal:input.signal,hash:async bytes=>[...new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,bytes.slice().buffer as ArrayBuffer))].map(byte=>byte.toString(16).padStart(2,"0")).join(""),uuid:()=>Crypto.randomUUID(),saved:savedStudyJob,onProgress:input.onProgress,request:async(path,method,body)=>{active();const result=await api(path,{method,signal:input.signal,body:body instanceof Uint8Array?body.slice().buffer as ArrayBuffer:body,timeoutMs:method==="POST"?135000:90000,headers:{"x-meras-acting-user":String(input.userId),"content-type":typeof body==="string"?"application/json":"application/octet-stream"}});active();return result;}},input);
}
