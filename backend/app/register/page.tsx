import type { Metadata } from "next";
import { AuthShell, RegisterForm } from "@/components/auth-shell";
import { getInstitutionsCatalog } from "@/lib/catalog-store";
export const metadata: Metadata = { title: "إنشاء حساب" };
export const dynamic = "force-dynamic";
export default async function RegisterPage(){const institutions=await getInstitutionsCatalog();return <AuthShell mode="register"><RegisterForm institutions={institutions} /></AuthShell>}
