import { X509Certificate } from "node:crypto";

type VerifiedConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: { ca: string; rejectUnauthorized: true };
  application_name?: string;
};

/**
 * A CA supplied by the hosting platform must reach pg as an explicit TLS option.
 * pg-connection-string replaces the `ssl` object when DATABASE_URL contains
 * `sslmode`, so the verified path uses structured connection parameters.
 */
type LegacyConnection = { connectionString: string; ssl?: { rejectUnauthorized: boolean } };

export function databaseConnectionOptions(env: NodeJS.ProcessEnv = process.env): VerifiedConnection | LegacyConnection {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const ca = env.DATABASE_CA_CERT?.trim();
  const sslEnabled = env.DATABASE_SSL === "true" || /[?&]sslmode=(require|verify-ca|verify-full)/i.test(connectionString);
  const rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
  if (env.HOSTING_PLATFORM === "digitalocean-app-platform" && (!ca || !sslEnabled || !rejectUnauthorized)) {
    throw new Error("DigitalOcean requires verified database TLS with DATABASE_CA_CERT");
  }
  if (!ca) return { connectionString, ssl: sslEnabled ? { rejectUnauthorized } : undefined };
  if (!sslEnabled || !rejectUnauthorized) throw new Error("Verified database TLS is required with DATABASE_CA_CERT");
  try { new X509Certificate(ca); }
  catch { throw new Error("DATABASE_CA_CERT is not a valid PEM certificate"); }

  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error("Invalid DATABASE_URL"); }
  if (!(url.protocol === "postgres:" || url.protocol === "postgresql:") || !url.hostname || !/^\/[^/]+$/.test(url.pathname)
      || url.hash || [...url.searchParams.keys()].some(key => key !== "sslmode" && key !== "application_name")) {
    throw new Error("Unsupported DATABASE_URL for verified database TLS");
  }
  const sslModes = url.searchParams.getAll("sslmode");
  if (sslModes.length > 1 || sslModes.some(mode => !["require", "verify-ca", "verify-full"].includes(mode))) {
    throw new Error("Invalid sslmode for verified database TLS");
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Invalid database port");
  const options: VerifiedConnection = {
    host: url.hostname,
    port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { ca, rejectUnauthorized: true },
  };
  const applicationName = url.searchParams.get("application_name");
  if (applicationName) options.application_name = applicationName;
  return options;
}

export function drizzleConnectionOptions(env: NodeJS.ProcessEnv = process.env) {
  const options = databaseConnectionOptions(env);
  if ("connectionString" in options) return { url: options.connectionString };
  const { host, port, user, password, database, ssl } = options;
  if (!host || !database) throw new Error("Invalid verified database configuration");
  return { host, port, user, password, database, ssl };
}
