import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const backend = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, backend), "utf8");

test("support API protects ticket ownership and manager-only closure/deletion", async () => {
  const route = await read("app/api/support/route.ts");
  const consoleRoute = await read("app/api/admin/console/route.ts");
  assert.match(route, /if \(!isManager\(current\) && ticket\.userEmail !== current\.email\) return jsonError\("غير مصرح", 403\)/);
  assert.match(route, /action === "close" && !isManager\(current\)\) return jsonError/);
  assert.match(route, /const machineAuthorized = isAdminRequest\(request\)/);
  assert.match(route, /await tx\.delete\(supportReplyFiles\)/);
  assert.match(route, /await Promise\.all\(files\.map\(\(file\) => deleteObject/);
  assert.match(consoleRoute, /action === "updateTicket"/);
  assert.match(consoleRoute, /\["new", "open", "waiting", "resolved", "closed"\]/);
});

test("web and Expo support surfaces open a selected conversation from cards", async () => {
  const [studentDashboard, supportForm, webAdmin, expoStudent, expoAdmin] = await Promise.all([
    read("components/student-dashboard.tsx"),
    read("components/support-form.tsx"),
    read("components/admin-dashboard.tsx"),
    read(new URL("mobile/app/support.tsx", backend)),
    read(new URL("mobile/app/admin.tsx", backend)),
  ]);
  assert.match(studentDashboard, /support-ticket-card/);
  assert.match(studentDashboard, /\/support\?ticket=\$\{ticket\.id\}/);
  assert.match(supportForm, /URLSearchParams\(window\.location\.search\)/);
  assert.match(supportForm, /useState<number \| null>\(null\)/);
  assert.match(supportForm, /params\.get\("ticket"\)/);
  assert.match(supportForm, /useRealtimeSync\(/);
  assert.match(supportForm, /params\.get\("order"\)/);
  assert.match(webAdmin, /const \[selectedId,setSelectedId\]=useState<number\|null>\(null\)/);
  assert.match(webAdmin, /ticket-back-button/);
  assert.match(expoStudent, /onPress=\{\(\) => setSelectedId\(ticket\.id\)\}/);
  assert.match(expoAdmin, /const selected = rows\.find\(\(row\) => row\.id === selectedId\)/);
  assert.match(expoAdmin, /action: "deleteEntity"/);
  assert.match(expoAdmin, /support_ticket/);
  assert.match(expoAdmin, /values=\{\["open", "waiting", "resolved", "closed"\]\}/);
});
