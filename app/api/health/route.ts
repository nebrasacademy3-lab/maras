import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { observeRequest } from "@/lib/observability";
import { checkStorageReadiness } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

type CheckStatus = "ready" | "unavailable" | "configured" | "missing" | "enabled" | "disabled";

function strongSecret(name: string) {
  const value = process.env[name]?.trim() || "";
  return value.length >= 32 && !/(?:replace[-_ ]?with|change[-_ ]?me|example[-_ ]?secret)/i.test(value);
}

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

async function databaseReadiness(): Promise<CheckStatus> {
  try {
    await getDb().execute(sql`select 1`);
    return "ready";
  } catch {
    return "unavailable";
  }
}

async function storageReadiness(): Promise<CheckStatus> {
  return await checkStorageReadiness() ? "ready" : "unavailable";
}

export async function GET(request: Request) {
  return observeRequest(request, "health.readiness", async (requestId) => {
    const [database, storage] = await Promise.all([databaseReadiness(), storageReadiness()]);
    const production = process.env.NODE_ENV === "production";
    const configuration = {
      administration: strongSecret("ADMIN_API_TOKEN") ? "configured" : "missing",
      uploads: strongSecret("ADMIN_UPLOAD_TOKEN") ? "configured" : "missing",
      videoSigning: strongSecret("VIDEO_SIGNING_SECRET") ? "configured" : "missing",
      scheduledTasks: strongSecret("SCHEDULED_TASK_TOKEN") ? "configured" : "missing",
      malwareScanner: configured("MALWARE_SCAN_URL") ? "configured" : "missing",
    } satisfies Record<string, CheckStatus>;
    const requiredConfigurationReady = !production || Object.values(configuration).every((status) => status === "configured");
    const ok = database === "ready" && storage === "ready" && requiredConfigurationReady;
    const capabilities = {
      payments: configured("TAP_SECRET_KEY", "TAP_WEBHOOK_SECRET") ? "enabled" : "disabled",
      email: configured("RESEND_API_KEY", "EMAIL_FROM") ? "enabled" : "disabled",
      enhancedAssistant: configured("OPENAI_API_KEY") ? "enabled" : "disabled",
      pushDispatch: configuration.scheduledTasks === "configured" ? "enabled" : "disabled",
      malwareScanning: configuration.malwareScanner === "configured" ? "enabled" : "disabled",
    } satisfies Record<string, CheckStatus>;

    return Response.json({
      ok,
      status: ok ? "ready" : "unavailable",
      service: "meras-alelm",
      requestId,
      database,
      readiness: {
        database,
        storage,
        configuration,
      },
      capabilities,
      time: new Date().toISOString(),
    }, { status: ok ? 200 : 503, headers: responseHeaders });
  });
}
