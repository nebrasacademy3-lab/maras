import {useQuery} from "@tanstack/react-query";
import {useAuth} from "@/src/providers/AuthProvider";
import {api} from "@/src/lib/api";
import {permissionsCover} from "@/src/lib/staff-policy";
export function useAdminCapabilities(){
  const {user}=useAuth();
  const query=useQuery({queryKey:["admin-capabilities",user?.id],queryFn:({signal})=>api<{user:{id:number;isPlatformOwner:boolean};permissions:string[]}>("/api/admin/me",{signal}),enabled:!!user&&["admin","supervisor"].includes(user.role),staleTime:15000,refetchInterval:60000,retry:1});
  const valid=query.data?.user.id===user?.id&&!query.isError;
  const permissions=valid&&query.data?query.data.permissions:[];
  const owner=valid&&query.data?.user.isPlatformOwner===true;
  return {...query,permissions,owner,can:(required:readonly string[])=>Boolean(valid&&(owner||permissionsCover(new Set(permissions),required)))};
}
