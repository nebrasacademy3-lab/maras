import React,{useEffect,useState} from "react";
import {Platform,View} from "react-native";
import {VideoView,useVideoPlayer} from "expo-video";
import {ScaledText as Text} from "@/src/components/ScaledText";
import {apiRequestUrl,getApiToken} from "@/src/lib/api";
import {useTheme} from "@/src/providers/ThemeProvider";
export function InstructorPreview({path}:{path:string}){
 const {colors}=useTheme(),token=getApiToken(),[error,setError]=useState("");
 const player=useVideoPlayer({uri:apiRequestUrl(path).toString(),headers:{authorization:`Bearer ${token}`,"x-meras-client":"mobile-v1","x-meras-platform":Platform.OS},useCaching:false},instance=>{instance.loop=false;});
 useEffect(()=>{const subscription=player.addListener("statusChange",event=>{if(event.status==="error")setError("تعذر تشغيل الفيديو. حدّث حالة المعالجة ثم حاول مجددًا.");});return()=>subscription.remove();},[player]);
 return <View style={{gap:12,marginVertical:20}}><VideoView player={player} style={{width:"100%",aspectRatio:16/9,backgroundColor:"#101722"}} nativeControls allowsPictureInPicture={false} />{error?<Text style={{color:colors.danger,textAlign:"right"}}>{error}</Text>:null}</View>;
}
