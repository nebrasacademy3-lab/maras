import React, { useEffect, useRef, useState } from "react";
import { Linking, Modal, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { AppButton, Card, Field } from "@/src/components/ui";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { api, getApiToken, jsonBody } from "@/src/lib/api";
import { normalizeEmailCode } from "@/src/lib/account-access";
import { MerasAlert } from "@/src/lib/interaction-events";
import { useAuth } from "@/src/providers/AuthProvider";
import { useTheme } from "@/src/providers/ThemeProvider";
export function DeleteAccountPanel() { const {user}=useAuth(); return user?<DeleteAccountForm key={user.id} />:null; }
function DeleteAccountForm() {
  const {user,logout}=useAuth(),{colors}=useTheme();
  const [open,setOpen]=useState(false),[password,setPassword]=useState(""),[code,setCode]=useState(""),[confirmation,setConfirmation]=useState(""),[emailMode,setEmailMode]=useState(false),[busy,setBusy]=useState(""),[message,setMessage]=useState("");
  const pending=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const query=useQuery({queryKey:["account-deletion-method",user?.id],enabled:Boolean(user&&open),queryFn:({signal})=>api<{allowed:boolean;method:"password"|"email_code"}>("/api/mobile/account",{signal}),retry:false,staleTime:0});
  const byEmail=emailMode||query.data?.method==="email_code";
  async function perform(action:"send"|"delete") {
    if(pending.current||!query.data?.allowed)return;
    const token=getApiToken();pending.current=true;setBusy(action);setMessage("");
    try {
      if(action==="send"){await api("/api/mobile/account",{method:"POST",body:jsonBody({})});if(mounted.current&&token===getApiToken())setMessage("أرسلنا رمز حذف مستقل إلى بريد حسابك. ينتهي بعد 10 دقائق. انتظر دقيقة قبل طلب رمز جديد.");}
      else {
        const result=await api<{appleManualRevocationRequired?:boolean}>("/api/mobile/account",{method:"DELETE",body:jsonBody({confirmation,...(byEmail?{code}:{password})})});
        if(token!==getApiToken())return;
        await logout();setOpen(false);setPassword("");setCode("");router.replace("/(auth)/welcome");
        if(result.appleManualRevocationRequired)MerasAlert.alert("تم حذف الحساب","لم يكن رمز Apple القديم محفوظًا لدينا. أكمل إلغاء الربط من إعدادات حساب Apple وفق التعليمات الرسمية.",[{text:"تم"},{text:"تعليمات Apple",onPress:()=>{void Linking.openURL("https://support.apple.com/102571");}}]);
      }
    }catch(error){if(mounted.current&&token===getApiToken())setMessage(error instanceof Error?error.message:"تعذر إكمال العملية");}
    finally{pending.current=false;if(mounted.current)setBusy("");}
  }
  if(!user||!["student","instructor"].includes(user.role))return null;
  const text={color:colors.textSoft,fontSize:14,lineHeight:25,textAlign:"right" as const};
  const close=()=>{if(busy)return;setOpen(false);setPassword("");setCode("");setConfirmation("");setMessage("");};
  return <><Card style={{gap:12,marginTop:16,borderColor:colors.danger}}><Text style={{color:colors.danger,fontSize:20,fontWeight:"800",textAlign:"right"}}>حذف الحساب</Text><Text style={text}>يزيل الحذف بيانات الحساب والجلسات والأجهزة والطلبات والملفات والمحادثات والملاحظات والتقدم والدعم. تبقى السجلات المالية والعقود الموقعة وحقوق المحتوى المطلوبة نظاميًا حسب سياسة الاحتفاظ؛ حذف الحساب لا يلغي تلقائيًا اشتراك متجر سابق.</Text><AppButton title="طلب حذف حسابي" variant="danger" onPress={()=>{setEmailMode(false);setOpen(true);}} /></Card>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}><View style={{flex:1,justifyContent:"center",padding:20,backgroundColor:colors.overlay}}><View style={{maxHeight:"90%",padding:20,borderRadius:22,backgroundColor:colors.background}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:14}}><Text accessibilityRole="header" style={{color:colors.danger,fontSize:23,fontWeight:"800",textAlign:"right"}}>تأكيد الحذف نهائيًا</Text><Text style={text}>راجع أثر الحذف، ثم اكتب «حذف حسابي» وأكد ملكيتك للحساب.</Text>{query.isLoading?<Text style={text}>جارٍ تحميل طريقة التأكيد…</Text>:query.isError?<><Text style={text}>تعذر تحميل طريقة التأكيد.</Text><AppButton title="إعادة المحاولة" onPress={()=>void query.refetch()} /></>:!query.data?.allowed?<Text style={text}>الحساب الإداري يديره المدير الأعلى.</Text>:<><Field label="عبارة التأكيد" value={confirmation} onChangeText={setConfirmation} placeholder="حذف حسابي" editable={!busy} />{byEmail?<><AppButton title="إرسال رمز حذف إلى بريدي" variant="soft" loading={busy==="send"} disabled={Boolean(busy)} onPress={()=>void perform("send")} /><Field label="رمز حذف الحساب" value={code} onChangeText={value=>setCode(normalizeEmailCode(value))} keyboardType="number-pad" inputDirection="ltr" maxLength={6} editable={!busy} /></>:<><Field label="كلمة المرور" value={password} onChangeText={setPassword} secureTextEntry editable={!busy} /><AppButton title="التأكيد برمز البريد بدل كلمة المرور" variant="ghost" disabled={Boolean(busy)} onPress={()=>{setPassword("");setEmailMode(true);}} /></>}<AppButton title="حذف الحساب نهائيًا" variant="danger" loading={busy==="delete"} disabled={Boolean(busy)||confirmation!=="حذف حسابي"||(byEmail?code.length!==6:password.length<8)} onPress={()=>void perform("delete")} /></>}{message?<Text accessibilityLiveRegion="polite" style={text}>{message}</Text>:null}<AppButton title="إلغاء والاحتفاظ بحسابي" variant="ghost" disabled={Boolean(busy)} onPress={close} /></ScrollView></View></View></Modal></>;
}
