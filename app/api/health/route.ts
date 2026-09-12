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

function configuredAny(...names: string[]) {
  return names.some((name) => Boolean(process.env[name]?.trim()));
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
    const requiredConfiguration = {
      sessionSigning: strongSecret("SESSION_SECRET") ? "configured" : "missing",
      administration: strongSecret("ADMIN_API_TOKEN") ? "configured" : "missing",
      uploads: strongSecret("ADMIN_UPLOAD_TOKEN") ? "configured" : "missing",
      videoSigning: strongSecret("VIDEO_SIGNING_SECRET") ? "configured" : "missing",
    } satisfies Record<string, CheckStatus>;
    const schedulerEnabled = process.env.LIFECYCLE_SCHEDULER_ENABLED?.trim().toLowerCase() !== "false";
    const optionalConfiguration = {
      scheduledTasks: strongSecret("SCHEDULED_TASK_TOKEN") || schedulerEnabled ? "configured" : "missing",
      malwareScanner: configured("MALWARE_SCAN_URL") ? "configured" : "missing",
    } satisfies Record<string, CheckStatus>;
    const configuration = { ...requiredConfiguration, ...optionalConfiguration } satisfies Record<string, CheckStatus>;
    const requiredConfigurationReady = !production || Object.values(requiredConfiguration).every((status) => status === "configured");
    const ok = database === "ready" && storage === "ready" && requiredConfigurationReady;
    const degraded = ok && Object.values(optionalConfiguration).some((status) => status !== "configured");
    const capabilities = {
      payments: configured("TAP_SECRET_KEY", "TAP_WEBHOOK_SECRET") ? "enabled" : "disabled",
      email: configured("RESEND_API_KEY", "EMAIL_FROM") ? "enabled" : "disabled",
      enhancedAssistant: configuredAny("GEMINI_API_KEY", "GEMINI_API_KEYS", "OPENAI_API_KEY") ? "enabled" : "disabled",
      pushDispatch: optionalConfiguration.scheduledTasks === "configured" ? "enabled" : "disabled",
      lifecycleScheduler: schedulerEnabled ? "enabled" : "disabled",
      malwareScanning: optionalConfiguration.malwareScanner === "configured" ? "enabled" : "disabled",
    } satisfies Record<string, CheckStatus>;

    return Response.json({
      ok,
      status: ok ? (degraded ? "degraded" : "ready") : "unavailable",
      service: "meras-alelm",
      requestId,
      database,
      readiness: {
        database,
        storage,
        requiredConfiguration,
        optionalConfiguration,
        configuration,
      },
      capabilities,
      time: new Date().toISOString(),
    }, { status: ok ? 200 : 503, headers: responseHeaders });
  });
}
