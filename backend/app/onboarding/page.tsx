import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {OnboardingTour} from "@/components/onboarding-tour";
import {requireUser} from "@/lib/server-auth";
export const metadata:Metadata={title:"دليل البداية",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function Page(){const user=await requireUser("/onboarding");if(user.onboardingCompleted)redirect("/dashboard");return <OnboardingTour firstName={user.fullName.split(" ")[0]}/>;}
