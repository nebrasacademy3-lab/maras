import { finishOAuth } from "@/lib/oauth";
export const runtime = "nodejs";
type Context = { params: Promise<{ provider: string }> };
export async function GET(request: Request, context: Context) {
  return finishOAuth(request, (await context.params).provider);
}
export async function POST(request: Request, context: Context) {
  return finishOAuth(request, (await context.params).provider);
}
