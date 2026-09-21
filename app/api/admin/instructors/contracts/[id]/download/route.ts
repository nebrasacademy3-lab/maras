import { downloadInstructorContract } from "@/lib/instructor-contract-download";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {return downloadInstructorContract(request,Number((await context.params).id),true);}
