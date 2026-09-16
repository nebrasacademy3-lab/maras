import React from "react";
import {View} from "react-native";
import {Card,AppButton} from "@/src/components/ui";
import {SearchPicker} from "@/src/components/SearchPicker";
import {ScaledText as Text} from "@/src/components/ScaledText";
import {useTheme} from "@/src/providers/ThemeProvider";
import {ADMIN_SELF_SECURITY,visibleAdminNavigation} from "@/src/lib/admin-navigation";
export function AdminNavigation({selected,permissions,owner,onSelect}:{selected:string;permissions:string[];owner:boolean;onSelect:(id:string)=>void}){
  const {colors}=useTheme(),groups=visibleAdminNavigation(permissions,owner),group=groups.find(g=>g.items.some(item=>item.id===selected));
  return <Card style={{gap:14}}><SearchPicker label="القسم الرئيسي" value={group?.id||""} placeholder="اختر قسمًا من صلاحياتك" items={groups.map(g=>({key:g.id,label:g.title,detail:g.description}))} onSelect={choice=>{const item=groups.find(g=>g.id===choice.key)?.items[0];if(item)onSelect(item.id);}}/>{group&&<SearchPicker label="المهمة داخل القسم" value={selected} placeholder="اختر المهمة" items={group.items.map(item=>({key:item.id,label:item.title,detail:item.description}))} onSelect={choice=>onSelect(choice.key)}/>}<View style={{flexDirection:"row-reverse",gap:12,alignItems:"center"}}><Text style={{flex:1,color:colors.textSoft,fontSize:12,lineHeight:22}}>تظهر المهام الممنوحة لك فقط، والصلاحية تُراجع من الخادم.</Text><AppButton title="حسابي وأماني" variant="soft" full={false} onPress={()=>onSelect(ADMIN_SELF_SECURITY.id)}/></View></Card>;
}
