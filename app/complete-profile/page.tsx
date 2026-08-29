import type{Metadata}from "next";
import{redirect}from "next/navigation";
import{AuthShell}from "@/components/auth-shell";
import{CompleteProfileForm}from "@/components/complete-profile-form";
import{getInstitutionsCatalog}from "@/lib/catalog-store";
import{currentUser}from "@/lib/server-auth";
export const metadata:Metadata={title:"إكمال الملف",robots:{index:false,follow:false}};export const dynamic="force-dynamic";
export default async function Page(){const user=await currentUser();if(!user)redirect("/login?return_to=/complete-profile");if(user.profileCompleted)redirect(user.onboardingCompleted?"/dashboard":"/onboarding");const institutions=await getInstitutionsCatalog();return <AuthShell mode="register"><CompleteProfileForm institutions={institutions} initial={{fullName:user.fullName,phone:user.phone||"",universitySlug:user.universitySlug||"",specialty:user.specialty||"",academicLevel:user.academicLevel||""}}/></AuthShell>;}
