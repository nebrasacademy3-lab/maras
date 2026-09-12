import { adminControlGuard } from "@/lib/admin-control-guard";
import { getCoursesCatalog,getInstitutionsCatalog } from "@/lib/catalog-store";
import { getPublicSpecialtyCatalog } from "@/lib/seo-catalog";
import { buildSeoReadiness } from "@/lib/seo-readiness";
import { googleSiteVerification,searchIndexingEnabled,seoSiteOrigin } from "@/lib/seo";
import { jsonError } from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const guard=await adminControlGuard(request);if(guard.response)return guard.response;
 try{const [courses,institutions,specialties]=await Promise.all([getCoursesCatalog(),getInstitutionsCatalog(),getPublicSpecialtyCatalog()]);
 return Response.json({ok:true,...buildSeoReadiness(courses,institutions,specialties,{origin:seoSiteOrigin(),indexing:searchIndexingEnabled(),verification:Boolean(googleSiteVerification())})},{headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
 }catch{return jsonError("تعذر قراءة تقرير الجاهزية؛ راجع اتصال قاعدة البيانات",503);}
}
