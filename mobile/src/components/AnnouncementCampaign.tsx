import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Linking, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { api } from "@/src/lib/api";
import { useTheme } from "@/src/providers/ThemeProvider";
import { useLanguage } from "@/src/providers/LanguageProvider";

type Announcement = { id:number; title:string; body:string; actionUrl:string|null; actionLabel:string|null; presentation:"banner"|"modal"|"all"; template?:string; dismissible:boolean };
const DISMISSED_KEY="meras-dismissed-announcements";

function routeFor(url:string|null){if(!url||!url.startsWith("/")||url.startsWith("//"))return null;if(url==="/courses")return "/(tabs)/courses";if(url==="/universities")return "/(tabs)/universities";if(url.startsWith("/courses/"))return {pathname:"/course/[slug]" as const,params:{slug:decodeURIComponent(url.slice("/courses/".length))}};if(url.startsWith("/learn/"))return {pathname:"/course/[slug]" as const,params:{slug:decodeURIComponent(url.slice("/learn/".length))}};return url as never;}
function externalFor(url:string|null){if(!url)return null;try{return new URL(url).protocol==="https:"?url:null}catch{return null}}
function iconFor(template?:string):React.ComponentProps<typeof Ionicons>["name"]{return template==="discount"?"pricetag-outline":template==="new-course"?"book-outline":template==="new-service"?"sparkles-outline":template==="urgent"?"warning-outline":template==="success"?"checkmark-circle-outline":"megaphone-outline";}
function gradientFor(template?:string):[string,string,string]{if(template==="discount")return["#7C2D12","#D97706","#F59E0B"];if(template==="urgent")return["#7F1D1D","#DC2626","#F43F5E"];if(template==="success")return["#064E3B","#059669","#10B981"];if(template==="new-service")return["#312E81","#6D28D9","#8B5CF6"];return["#071D54","#155EEF","#7242E9"];}
async function readDismissed(){try{const raw=Platform.OS==="web"?globalThis.localStorage?.getItem(DISMISSED_KEY):await SecureStore.getItemAsync(DISMISSED_KEY);const values=raw?JSON.parse(raw) as unknown:[];return new Set(Array.isArray(values)?values.filter((item):item is number=>Number.isInteger(item)):[])}catch{return new Set<number>()}}
async function writeDismissed(values:Set<number>){try{const raw=JSON.stringify([...values].slice(-200));if(Platform.OS==="web")globalThis.localStorage?.setItem(DISMISSED_KEY,raw);else await SecureStore.setItemAsync(DISMISSED_KEY,raw)}catch{/* ignore */}}

function MarqueeText({text,isRTL}:{text:string;isRTL:boolean}){
  const[progress]=useState(()=>new Animated.Value(0));
  const[reduceMotion,setReduceMotion]=useState(false);
  useEffect(()=>{let active=true;void AccessibilityInfo.isReduceMotionEnabled().then((value)=>active&&setReduceMotion(value));const subscription=AccessibilityInfo.addEventListener("reduceMotionChanged",setReduceMotion);return()=>{active=false;subscription.remove()};},[]);
  useEffect(()=>{progress.stopAnimation();progress.setValue(0);if(reduceMotion)return;const animation=Animated.loop(Animated.timing(progress,{toValue:1,duration:14500,useNativeDriver:true}));animation.start();return()=>animation.stop();},[progress,reduceMotion,text]);
  if(reduceMotion)return <Text numberOfLines={1} style={styles.tickerText}>{text}</Text>;
  return <View accessible accessibilityLabel={text} style={styles.ticker}><Animated.View style={[styles.tickerTrack,{transform:[{translateX:progress.interpolate({inputRange:[0,1],outputRange:isRTL?[0,-280]:[0,280]})}]}]}><Text aria-hidden style={styles.tickerText}>{text}  ✦  </Text><Text aria-hidden style={styles.tickerText}>{text}  ✦  </Text></Animated.View></View>;
}

export function AnnouncementCampaign(){
  const{colors}=useTheme();
  const{direction,rowDirection,isRTL}=useLanguage();
  const[dismissed,setDismissed]=useState<Set<number>>(()=>new Set());
  const[seenModal,setSeenModal]=useState<Set<number>>(()=>new Set());
  const[hydrated,setHydrated]=useState(false);
  useEffect(()=>{let active=true;void readDismissed().then((values)=>{if(active){setDismissed(values);setHydrated(true)}});return()=>{active=false}},[]);
  const query=useQuery({queryKey:["announcements"],queryFn:()=>api<{announcements:Announcement[]}>("/api/public/announcements"),refetchInterval:60_000,staleTime:20_000});
  const rows=hydrated?(query.data?.announcements||[]).filter((item)=>!dismissed.has(item.id)):[];
  const modal=rows.find((item)=>(item.presentation==="modal"||item.presentation==="all")&&!seenModal.has(item.id)&&(item.dismissible||Boolean(item.actionUrl)))||null;
  const banner=rows.find((item)=>item.id!==modal?.id&&(item.presentation==="banner"||(item.presentation==="all"&&seenModal.has(item.id))||((item.presentation==="modal"||item.presentation==="all")&&!item.dismissible&&!item.actionUrl)))||null;
  const close=(id:number)=>setDismissed((current)=>{const next=new Set(current).add(id);void writeDismissed(next);return next});
  const later=(item:Announcement)=>{if(item.presentation==="all")setSeenModal((current)=>new Set(current).add(item.id));else close(item.id)};
  const action=(item:Announcement,compact=false)=>{const route=routeFor(item.actionUrl);const external=externalFor(item.actionUrl);if(!route&&!external)return null;return <Pressable style={[compact?styles.bannerAction:styles.modalAction,{borderColor:compact?"rgba(255,255,255,.25)":colors.primary,backgroundColor:compact?"rgba(255,255,255,.13)":colors.primary}]} onPress={()=>{close(item.id);if(external)void Linking.openURL(external);else if(route)router.push(route)}}><Text style={styles.actionText}>{item.actionLabel||"اعرف المزيد"}</Text><Ionicons name={isRTL?"arrow-back":"arrow-forward"} size={14} color="#FFF"/></Pressable>};
  return <>{banner?<LinearGradient colors={gradientFor(banner.template)} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.banner,{direction,flexDirection:rowDirection}]}><View style={styles.bannerIcon}><Ionicons name={iconFor(banner.template)} size={18} color="#FFF"/></View><MarqueeText text={`${banner.title} — ${banner.body}`} isRTL={isRTL}/>{action(banner,true)}{banner.dismissible?<Pressable accessibilityRole="button" accessibilityLabel="إخفاء الإعلان" onPress={()=>close(banner.id)} hitSlop={10} style={styles.close}><Ionicons name="close" size={18} color="#FFF"/></Pressable>:null}</LinearGradient>:null}{modal?<Modal visible transparent animationType="fade" onRequestClose={()=>modal.dismissible&&later(modal)}><View style={[styles.backdrop,{direction}]}><View style={[styles.modal,{direction,backgroundColor:colors.surface,borderColor:colors.border}]}><LinearGradient colors={gradientFor(modal.template)} style={styles.modalIcon}><Ionicons name={iconFor(modal.template)} size={28} color="#FFF"/></LinearGradient><Text style={[styles.kicker,{color:colors.primary}]}>إعلان من مراس</Text><Text style={[styles.modalTitle,{color:colors.text}]}>{modal.title}</Text><Text style={[styles.modalBody,{color:colors.textSoft}]}>{modal.body}</Text>{action(modal)}{modal.dismissible?<Pressable onPress={()=>later(modal)} style={styles.later}><Text style={{color:colors.textSoft,fontWeight:"800"}}>لاحقًا</Text></Pressable>:null}</View></View></Modal>:null}</>;
}

const styles=StyleSheet.create({
  banner:{zIndex:50,minHeight:49,paddingHorizontal:10,paddingVertical:6,alignItems:"center",gap:8,shadowColor:"#061A42",shadowOpacity:.16,shadowRadius:11,shadowOffset:{width:0,height:5},elevation:8},
  bannerIcon:{width:32,height:32,borderRadius:11,borderWidth:1,borderColor:"rgba(255,255,255,.2)",backgroundColor:"rgba(255,255,255,.12)",alignItems:"center",justifyContent:"center"},
  ticker:{flex:1,overflow:"hidden",minHeight:25,justifyContent:"center"},tickerTrack:{width:900,flexDirection:"row",alignItems:"center"},tickerText:{color:"#FFF",fontSize:10,fontWeight:"800",textAlign:"right",writingDirection:"rtl"},
  bannerAction:{minHeight:32,borderRadius:10,paddingHorizontal:9,borderWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:4},close:{width:30,height:30,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:"rgba(255,255,255,.1)"},
  modalAction:{minHeight:44,borderRadius:13,paddingHorizontal:15,borderWidth:1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6},actionText:{color:"#FFF",fontSize:9,fontWeight:"900"},
  backdrop:{flex:1,backgroundColor:"rgba(3,10,28,.66)",alignItems:"center",justifyContent:"center",padding:22},modal:{width:"100%",borderWidth:1,borderRadius:28,padding:23,shadowColor:"#000",shadowOpacity:.22,shadowRadius:24,shadowOffset:{width:0,height:12},elevation:10},modalIcon:{width:62,height:62,borderRadius:21,alignItems:"center",justifyContent:"center",shadowColor:"#155EEF",shadowOpacity:.2,shadowRadius:14,elevation:5},kicker:{fontSize:10,fontWeight:"900",marginTop:16},modalTitle:{fontSize:22,lineHeight:32,fontWeight:"900",marginTop:5,textAlign:"right",writingDirection:"rtl"},modalBody:{fontSize:12,lineHeight:22,marginTop:10,marginBottom:18,textAlign:"right",writingDirection:"rtl"},later:{minHeight:40,alignItems:"center",justifyContent:"center",paddingHorizontal:16,alignSelf:"center",marginTop:5},
});
