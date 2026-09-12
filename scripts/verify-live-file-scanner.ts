/** Staging probe: uses the REAL configured scanner, never a mocked clean response.
 * Sends only a benign test string and the harmless standard antivirus test pattern.
 * Does not write to the database or change any student's files.
 */
import { scannerConfig, scanClamd, scanRemote, SCAN_TIMEOUT_MS } from "../lib/malware-scanner";
import { createStoredZip } from "../lib/zip";

async function main() {
  const config = scannerConfig();
  if (config.mode !== "clamd" && config.mode !== "remote") throw new Error("Configure CLAMD_SOCKET, private CLAMD_HOST or MALWARE_SCAN_URL first.");
  const benign = Buffer.from("Meras file-scanning verification: benign plain-text fixture.\n", "utf8");
  // EICAR is a harmless antivirus test fixture, not executable malware.
  // Split to keep repository source files from being treated as the test file itself.
  const fixture = Buffer.from(["X5O!P%@AP[4\\PZX54(P^)7CC)7}", "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join(""), "ascii");
  const cases = [
    { name: "benign.txt", bytes: benign, expected: "clean", contentType: "text/plain" },
    { name: "antivirus-test.txt", bytes: fixture, expected: "quarantined", contentType: "text/plain" },
    { name: "antivirus-test.zip", bytes: createStoredZip([{ name: "test.txt", data: fixture }]), expected: "quarantined", contentType: "application/zip" },
  ];
  let failures = 0;
  for (const item of cases) {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(item.bytes); controller.close(); } });
    const signal = AbortSignal.timeout(SCAN_TIMEOUT_MS);
    const result = config.mode === "clamd" ? await scanClamd(body, config, signal) : await scanRemote(body, { originalName: item.name, contentType: item.contentType }, config, signal);
    const passed = result.status === item.expected;
    if (!passed) failures++;
    console.log(JSON.stringify({ test: item.name, expected: item.expected, actual: result.status, passed, error: result.error }));
  }
  if (failures) throw new Error(`${failures} live scanner checks failed. Do not release files by changing their security status manually.`);
}
main().catch(() => { console.error("Live scanner verification failed or the engine is unavailable. Check the private scanner service and signatures."); process.exitCode = 1; });
