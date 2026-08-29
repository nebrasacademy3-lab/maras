import type {Metadata} from "next";
import {AdminDashboard} from "@/components/admin-dashboard";
import {requireRole} from "@/lib/server-auth";
export const metadata:Metadata={title:"لوحة إدارة مراس",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function AdminPage(){const user=await requireRole("/admin",["admin"]);return <AdminDashboard adminName={user.fullName}/>;}
