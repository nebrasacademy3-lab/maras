import type {Metadata} from "next";
import {AdminDashboard} from "@/components/admin-dashboard";
import {requireRole} from "@/lib/server-auth";
export const metadata:Metadata={title:"لوحة إدارة مراس",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function AdminPage({searchParams}:{searchParams:Promise<{view?:string;q?:string}>}){const user=await requireRole("/admin",["admin","supervisor"]);const params=await searchParams;return <AdminDashboard key={`${user.id}:${params.view||"overview"}`} adminName={user.fullName} initialView={params.view} initialQuery={typeof params.q==="string"?params.q.slice(0,120):""}/>;}
