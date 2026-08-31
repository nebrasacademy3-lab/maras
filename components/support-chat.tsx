"use client";

/* eslint-disable @next/next/no-img-element -- authenticated support attachments cannot use the public Next image optimizer */

import { useMemo, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, LoaderCircle, Mic, Paperclip, Reply, Send, Square, X } from "lucide-react";
import { uploadWithProgress, uploadProgressLabel, type UploadProgress } from "@/lib/upload-client";

export type SupportChatFile = { id:number; originalName:string; contentType:string; sizeBytes:number; createdAt?:string };
export type SupportChatReply = { id:number; authorEmail:string; authorRole:string; body:string; internal?:boolean; replyToId?:number|null; createdAt:string; files?:SupportChatFile[] };
export type SupportChatTicket = { id:number; ticketNumber:string; userEmail:string|null; title:string; status:string; createdAt:string; updatedAt?:string; replies?:SupportChatReply[] };

function isImage(file:SupportChatFile){return file.contentType.startsWith("image/");}
function isAudio(file:SupportChatFile){return file.contentType.startsWith("audio/");}
function fileUrl(file:SupportChatFile, inline=false){return `/api/support/files/${file.id}${inline?"?inline=1":""}`;}

function downloadAll(files:SupportChatFile[]){
  files.forEach((file,index)=>window.setTimeout(()=>{
    const anchor=document.createElement("a"); anchor.href=fileUrl(file); anchor.download=file.originalName; anchor.style.display="none";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
  },index*180));
}

export function SupportChatThread({ticket,isManager=false,onReload,onReopen}:{ticket:SupportChatTicket;isManager?:boolean;onReload:()=>void|Promise<void>;onReopen?:()=>void|Promise<void>}){
  const messages=useMemo(()=>[...(ticket.replies||[])].filter((item)=>!item.internal&&(item.body||item.files?.length)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id-b.id),[ticket.replies]);
  const byId=useMemo(()=>new Map(messages.map((item)=>[item.id,item])),[messages]);
  const [text,setText]=useState(""); const [files,setFiles]=useState<File[]>([]); const [replyTo,setReplyTo]=useState<SupportChatReply|null>(null);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [progress,setProgress]=useState<UploadProgress|null>(null);
  const [recording,setRecording]=useState(false); const mediaRef=useRef<MediaRecorder|null>(null); const streamRef=useRef<MediaStream|null>(null); const chunksRef=useRef<Blob[]>([]); const inputRef=useRef<HTMLInputElement>(null);

  const startVoice=async()=>{
    setError("");
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined") throw new Error("التسجيل الصوتي غير مدعوم في هذا المتصفح.");
      const stream=await navigator.mediaDevices.getUserMedia({audio:true}); streamRef.current=stream; chunksRef.current=[];
      const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm";
      const recorder=new MediaRecorder(stream,{mimeType:mime}); mediaRef.current=recorder;
      recorder.ondataavailable=(event)=>{if(event.data.size)chunksRef.current.push(event.data);};
      recorder.onstop=()=>{
        const blob=new Blob(chunksRef.current,{type:"audio/webm"}); if(blob.size) setFiles((current)=>[...current,new File([blob],`voice-${Date.now()}.webm`,{type:"audio/webm"})].slice(0,8));
        streamRef.current?.getTracks().forEach((track)=>track.stop()); streamRef.current=null; mediaRef.current=null; setRecording(false);
      };
      recorder.start(); setRecording(true);
    }catch(reason){setError(reason instanceof Error?reason.message:"تعذر بدء التسجيل الصوتي");}
  };
  const stopVoice=()=>{if(mediaRef.current&&mediaRef.current.state!=="inactive")mediaRef.current.stop();};

  const send=async()=>{
    if(busy||(!text.trim()&&!files.length))return;
    setBusy(true);setError("");
    const form=new FormData();form.set("ticketId",String(ticket.id));form.set("message",text.trim());if(replyTo?.id&&replyTo.id>0)form.set("replyToId",String(replyTo.id));files.forEach((file)=>form.append("files",file));
    setProgress({loaded:0,total:files.reduce((sum,file)=>sum+file.size,0),percent:0,bytesPerSecond:0,remainingSeconds:null});
    try{
      await uploadWithProgress({url:"/api/support",body:form,timeoutMs:15*60_000,onProgress:setProgress});
      setText("");setFiles([]);setReplyTo(null);if(inputRef.current)inputRef.current.value="";await onReload();
    }catch(reason){setError(reason instanceof Error?reason.message:"تعذر إرسال الرسالة");}
    finally{setProgress(null);setBusy(false);}
  };

  const closed=ticket.status==="closed"||ticket.status==="resolved";
  return <div className="support-chat">
    <div className="support-chat-messages">
      {messages.map((message)=>{
        const mine=isManager?message.authorRole!=="student":message.authorRole==="student"; const quoted=message.replyToId?byId.get(message.replyToId):null;
        return <article key={message.id} className={`support-chat-bubble ${mine?"mine":"theirs"}`}>
          <div className="support-chat-meta"><strong>{mine?"أنت":isManager?"الطالب":"فريق مراس"}</strong><time>{new Date(message.createdAt).toLocaleString("ar-SA")}</time></div>
          {quoted&&<div className="support-chat-quote"><b>{quoted.authorRole==="student"?"الطالب":"فريق مراس"}</b><span>{quoted.body||quoted.files?.[0]?.originalName||"مرفق"}</span></div>}
          {message.body&&<p>{message.body}</p>}
          {message.files?.some(isImage)&&<div className="support-chat-images">{message.files.filter(isImage).map((file)=><a href={fileUrl(file,true)} target="_blank" rel="noreferrer" key={file.id}><img src={fileUrl(file,true)} alt={file.originalName}/><span><ImageIcon size={13}/>{file.originalName}</span></a>)}</div>}
          {message.files?.filter(isAudio).map((file)=><div className="support-chat-audio" key={file.id}><audio controls preload="metadata" src={fileUrl(file,true)}/><a href={fileUrl(file)} download><Download size={14}/></a></div>)}
          {message.files?.filter((file)=>!isImage(file)&&!isAudio(file)).length?<div className="support-chat-files">{message.files!.filter((file)=>!isImage(file)&&!isAudio(file)).map((file)=><a href={fileUrl(file)} download key={file.id}><FileText size={15}/><span>{file.originalName}</span><Download size={14}/></a>)}</div>:null}
          <footer><button type="button" onClick={()=>setReplyTo(message)}><Reply size={13}/> رد</button>{message.files&&message.files.length>1?<button type="button" onClick={()=>downloadAll(message.files!)}><Download size={13}/> تحميل الكل</button>:null}</footer>
        </article>;
      })}
    </div>
    {closed?<div className="support-chat-closed">المحادثة مغلقة.{onReopen&&<button type="button" className="button button-soft" onClick={()=>void onReopen()}>إعادة فتح المحادثة</button>}</div>:<div className="support-chat-composer">
      {replyTo&&<div className="support-chat-replying"><Reply size={15}/><span><b>رد على {replyTo.authorRole==="student"?"الطالب":"فريق مراس"}</b><small>{replyTo.body||replyTo.files?.[0]?.originalName||"مرفق"}</small></span><button type="button" onClick={()=>setReplyTo(null)}><X size={15}/></button></div>}
      {files.length?<div className="support-chat-selected-files">{files.map((file,index)=><span key={`${file.name}-${index}`}><Paperclip size={13}/>{file.name}<button type="button" onClick={()=>setFiles((rows)=>rows.filter((_,i)=>i!==index))}><X size={12}/></button></span>)}</div>:null}
      <textarea value={text} onChange={(event)=>setText(event.target.value)} placeholder="اكتب رسالة..." maxLength={4000}/>
      {progress&&<div className="upload-progress-card compact"><div><span style={{width:`${progress.percent}%`}}/></div><small>{uploadProgressLabel(progress)}</small></div>}
      {error&&<p className="form-error">{error}</p>}
      <div className="support-chat-actions">
        <label className="support-chat-attach"><Paperclip size={18}/><input ref={inputRef} type="file" multiple accept="image/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.txt" onChange={(event)=>setFiles(Array.from(event.target.files||[]).slice(0,8))}/></label>
        <button type="button" className={`support-chat-mic ${recording?"recording":""}`} onClick={()=>recording?stopVoice():void startVoice()} aria-label={recording?"إيقاف التسجيل":"تسجيل صوتي"}>{recording?<Square size={18}/>:<Mic size={18}/>}</button>
        <button type="button" className="support-chat-send" disabled={busy||(!text.trim()&&!files.length)} onClick={()=>void send()}>{busy?<LoaderCircle size={18} className="spin"/>:<Send size={18}/>}</button>
      </div>
    </div>}
  </div>;
}
