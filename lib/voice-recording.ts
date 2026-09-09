export function supportedVoiceType(isSupported: (type:string)=>boolean): {mimeType:string;contentType:string;extension:string}|null {
  const mimeType=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(isSupported);
  return mimeType ? {mimeType,contentType:mimeType.split(";")[0],extension:mimeType.startsWith("audio/mp4")?"m4a":"webm"} : null;
}

/** Own the microphone until stop, failure or navigation, including permission delays. */
export async function startVoiceRecording({signal,onFile,onStop,onError}:{signal:AbortSignal;onFile:(file:File)=>void;onStop:()=>void;onError:(message:string)=>void}) {
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")throw new Error("التسجيل الصوتي غير مدعوم في هذا المتصفح.");
  const format=supportedVoiceType(type=>MediaRecorder.isTypeSupported(type));
  if(!format)throw new Error("صيغة التسجيل غير مدعومة. يمكنك إرفاق ملف صوتي بدلًا من التسجيل.");
  if(signal.aborted)throw new DOMException("Cancelled","AbortError");
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const release=()=>stream.getTracks().forEach(track=>track.stop());
  if(signal.aborted){release();throw new DOMException("Cancelled","AbortError");}
  let recorder:MediaRecorder;
  try{recorder=new MediaRecorder(stream,{mimeType:format.mimeType});}catch(error){release();throw error;}
  const chunks:Blob[]=[];
  let disposed=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const dispose=()=>{
    if(disposed)return;
    disposed=true;if(timer)clearTimeout(timer);signal.removeEventListener("abort",dispose);
    recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;
    if(recorder.state!=="inactive")recorder.stop();release();
  };
  const stop=()=>{if(!disposed&&recorder.state!=="inactive")recorder.stop();};
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recorder.onstop=()=>{
    if(disposed)return;
    const blob=new Blob(chunks,{type:format.contentType});
    dispose();onStop();
    if(blob.size)onFile(new File([blob],`voice-${Date.now()}.${format.extension}`,{type:format.contentType}));
  };
  recorder.onerror=()=>{dispose();onStop();onError("تعذر إكمال التسجيل. حاول مرة أخرى أو أرفق ملفًا صوتيًا.");};
  signal.addEventListener("abort",dispose,{once:true});
  try{recorder.start();timer=setTimeout(stop,5*60_000);}catch(error){dispose();throw error;}
  return {stop,dispose};
}
