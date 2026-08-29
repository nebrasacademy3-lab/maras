import type {Metadata} from "next";
import {SupervisorDashboard} from "@/components/supervisor-dashboard";
import {requireRole} from "@/lib/server-auth";
export const metadata:Metadata={title:"مساحة مشرف المحتوى",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{view?:string}>}){const user=await requireRole("/supervisor",["supervisor","admin"]);return <SupervisorDashboard userName={user.fullName} initialView={(await searchParams).view||"overview"}/>;}
