import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import { authenticate, parseClamdReply, scanInput, scannerServer } from "../services/file-scanner/server.mjs";

test("scanner bridge authenticates bearer credentials without weak/default tokens", () => {
  assert.equal(authenticate("Bearer short", "short"), false);
  assert.equal(authenticate(`Bearer ${"a".repeat(32)}`, "a".repeat(32)), true);
  assert.equal(authenticate(`Bearer ${"b".repeat(32)}`, "a".repeat(32)), false);
  assert.throws(() => scannerServer({}), /MALWARE_SCAN_TOKEN/);
});
test("only exact clamd success is clean; threats and errors are not", () => {
  assert.equal(parseClamdReply("stream: OK\0").clean, true);
  assert.equal(parseClamdReply("stream: Eicar-Test-Signature FOUND\0").clean, false);
  for (const reply of ["ERROR", "stream: size limit ERROR\0", "something OK", "stream: NOT OK\0"]) assert.throws(() => parseClamdReply(reply));
});
test("INSTREAM bridge sends length-prefixed chunks and reads the scanner verdict", async () => {
  let received = Buffer.alloc(0); let requestBytes;
  const server = createServer(socket => { socket.on("data", chunk => {
    received = Buffer.concat([received, chunk]);
    if (!received.subarray(0, 10).equals(Buffer.from("zINSTREAM\0"))) return;
    let cursor = 10; const parts = [];
    while (cursor + 4 <= received.length) {
      const length = received.readUInt32BE(cursor); cursor += 4;
      if (!length) { requestBytes = Buffer.concat(parts); socket.end("stream: OK\0"); return; }
      if (cursor + length > received.length) return;
      parts.push(received.subarray(cursor, cursor + length)); cursor += length;
    }
  }); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await scanInput(Readable.from([Buffer.from("small"), Buffer.from(" test")]), { host: "127.0.0.1", port: server.address().port });
    assert.equal(result.clean, true); assert.equal(requestBytes.toString(), "small test");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
