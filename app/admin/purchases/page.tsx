import type {Metadata} from "next";
import { requireRole } from "@/lib/server-auth";
import {AdminStorePurchases} from "@/components/admin-store-purchases";
export const metadata:Metadata={title:"مشتريات التطبيقات | إدارة مراس",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function Page(){await requireRole("/admin/purchases",["admin"]);return <AdminStorePurchases/>;}