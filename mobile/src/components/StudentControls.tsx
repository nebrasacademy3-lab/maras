import React,{useRef,useState} from "react";
import {View} from "react-native";
import * as Crypto from "expo-crypto";
import {SearchPicker} from "@/src/components/SearchPicker";
import {ScaledText as Text} from "@/src/components/ScaledText";
import {ScaledTextInput as TextInput} from "@/src/components/ScaledTextInput";
import {AppButton,Card} from "@/src/components/ui";
import {api,jsonBody,isAdminStepUpError,ADMIN_STEP_UP_MESSAGE} from "@/src/lib/api";
import type {StudentControlsData,ControlOption} from "@/src/lib/student-controls";
import {useTheme} from "@/src/providers/ThemeProvider";
export function StudentControls({email,controls,group,onChanged,onStepUpRequired}:{email:string;controls?:StudentControlsData;group?:string;onChanged:()=>void|Promise<void>;onStepUpRequired?:(message:string)=>void}) {
 const {colors}=useTheme();const [open,setOpen]=useState(false);const [action,setAction]=useState("");const [values,setValues]=useState<Record<string,string>>({});const [reason,setReason]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [search,setSearch]=useState("");const [remoteOptions,setRemoteOptions]=useState<ControlOption[]|null>(null);
 const attempt=useRef<{body:string;key:string}|null>(null);
 const definitions=(controls?.actions||[]).filter(row=>!group||row.group===group);const definition=definitions.find(row=>row.action===action);
 if(!controls||!definitions.length)return null;
 const inputStyle={borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,color:colors.text,textAlign:"right" as const,writingDirection:"rtl" as const,minHeight:48,fontSize:14};
 const choose=(value:string)=>{setAction(value);setValues(value==="profile.update"?{...controls.profile}:{});setMessage("");setRemoteOptions(null);setSearch("");};
 async function findRecords(){const kind=definition?.fields.find(field=>field.key==="id")?.choices;if(!kind)return;setBusy(true);try{const result=await api<{items:ControlOption[];total:number}>(`/api/admin/students/${encodeURIComponent(email)}/records?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(search)}`);setRemoteOptions(result.items);setMessage(`نتائج البحث: ${result.total}. تظهر أول 100 نتيجة؛ ضيّق البحث للوصول للسجل.`);}catch(e){setMessage(e instanceof Error?e.message:"تعذر البحث");}finally{setBusy(false);}}
 async function submit(){
  if(!definition||busy)return;if(reason.trim().length<3){setMessage("اكتب سبب الإجراء من ثلاثة أحرف على الأقل");return;}
  const fields=Object.fromEntries(definition.fields.map(field=>[field.key,values[field.key]??field.initial??""]));
  if(definition.fields.some(field=>field.required&&!String(fields[field.key]||"").trim())){setMessage("أكمل الحقول المطلوبة");return;}
  const payload={action,reason,...fields,...(action==="profile.update"?{expectedUpdatedAt:values.expectedUpdatedAt||controls!.profile.expectedUpdatedAt}:{})};const body=JSON.stringify(payload);if(attempt.current?.body!==body)attempt.current={body,key:Crypto.randomUUID()};
  setBusy(true);setMessage("");
  try{const result=await api<{message:string}>(`/api/admin/students/${encodeURIComponent(email)}/actions`,{method:"POST",body:jsonBody({...payload,operationKey:attempt.current.key})});setMessage(result.message);setReason("");attempt.current=null;await onChanged();}
  catch(e){if(isAdminStepUpError(e)){onStepUpRequired?.(ADMIN_STEP_UP_MESSAGE);setMessage(ADMIN_STEP_UP_MESSAGE);}else setMessage(e instanceof Error?e.message:"تعذر الحفظ");}finally{setBusy(false);}
 }
 return <Card style={{gap:12,marginVertical:12}}><AppButton title={open?"إغلاق التحكم المباشر":"التحكم المباشر من ملف الطالب"} icon="options-outline" variant="soft" disabled={busy} onPress={()=>setOpen(!open)}/>{open?<View style={{gap:12}}>
  <SearchPicker label="الإجراء" value={action} items={definitions.map(row=>({key:row.action,label:row.label}))} placeholder="اختر الإجراء" disabled={busy} onSelect={row=>choose(row.key)}/>
  {definition?.warning?<Text style={{color:colors.textSoft,textAlign:"right",lineHeight:22}}>{definition.warning}</Text>:null}
  {definition?.fields.some(field=>field.key==="id")?<><TextInput style={inputStyle} value={search} onChangeText={setSearch} placeholder="ابحث في كل سجلات الطالب بالاسم أو الرقم" placeholderTextColor={colors.textSoft} editable={!busy} maxLength={160}/><AppButton title="بحث جميع السجلات" variant="ghost" disabled={busy} onPress={()=>void findRecords()}/></>:null}
  {definition?.fields.map(field=>{const value=values[field.key]??field.initial??"";const options=field.options||(field.key==="id"&&remoteOptions!==null?remoteOptions:controls.choices[field.choices||""]||[]);return field.type==="select"?<SearchPicker key={field.key} label={field.label} value={value} items={options.map(o=>({key:o.value,label:o.label}))} placeholder="اختر من القائمة" disabled={busy} onSelect={row=>setValues({...values,[field.key]:row.key})}/>:<View key={field.key} style={{gap:6}}><Text style={{color:colors.text,textAlign:"right"}}>{field.label}</Text><TextInput accessibilityLabel={field.label} style={[inputStyle,field.type==="textarea"?{minHeight:100,textAlignVertical:"top"}:{}]} value={value} onChangeText={text=>setValues({...values,[field.key]:text})} maxLength={field.maxLength} keyboardType={field.type==="number"?"number-pad":"default"} multiline={field.type==="textarea"} editable={!busy}/></View>;})}
  {definition?<><Text style={{color:colors.text,textAlign:"right"}}>سبب الإجراء (يسجل في سجل التدقيق)</Text><TextInput accessibilityLabel="سبب الإجراء" style={[inputStyle,{minHeight:80,textAlignVertical:"top"}]} value={reason} onChangeText={setReason} maxLength={500} multiline editable={!busy}/><AppButton title="تأكيد الإجراء وحفظه" loading={busy} onPress={()=>void submit()}/></>:null}
  {message?<Text accessibilityLiveRegion="polite" style={{color:colors.text,textAlign:"right",lineHeight:24}}>{message}</Text>:null}
 </View>:null}</Card>;
}
