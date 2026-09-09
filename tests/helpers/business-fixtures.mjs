import { readFile } from "node:fs/promises";
import ts from "typescript";
export async function isolated(path, dependencies = {}, append = "") {
  const source = (await readFile(new URL(path, new URL("../", import.meta.url)), "utf8")).replace(/^import\s[\s\S]*?;\r?\n/gm, "").replace(/^export \{[^}]*\} from [^;]+;\r?\n/gm, "");
  const key = "__businessAudit" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = `const {${Object.keys(dependencies).join(",")}} = globalThis[${JSON.stringify(key)}];\n${source}\n${append}`;
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
export const sql = (strings, ...values) => ({ kind: "sql", text: strings.join("?"), values });
export const eq = (column, value) => ({ kind: "eq", column, value });
export const ne = (column, value) => ({ kind: "ne", column, value });
export const and = (...clauses) => ({ kind: "and", clauses });
export const tables = Object.fromEntries(["orders", "orderItems", "aiSubscriptionOrders", "aiEntitlements", "paymentEvents", "courseAccess", "courseAccessEvents", "notificationsDb", "couponUses", "refundRequests", "invoices", "cartItems", "courseWaitlist", "analyticsEvents", "courseRequestFiles", "courseRequests", "users", "authDevices", "authSessions", "pushDevices", "auditLogs"].map(name => [name, new Proxy({ _name: name }, { get(target, key) { return key === "_name" ? target._name : { table: name, key }; } })]));
export function database(initial = {}) {
  const rows = Object.fromEntries(Object.keys(tables).map(name => [name, structuredClone(initial[name] || [])]));
  const writes = [];
  const locks = new Map();
  function matches(row, clause) {
    if (!clause) return true;
    if (clause.kind === "and") return clause.clauses.every(item => matches(row, item));
    if (clause.kind === "eq") return row[clause.column.key] === clause.value;
    if (clause.kind === "isNull") return row[clause.column.key] == null;
    if (clause.kind === "gt") return row[clause.column.key] > clause.value;
    if (clause.kind === "ne") return row[clause.column.key] !== clause.value;
    throw new Error("Unexpected query " + JSON.stringify(clause));
  }
  function project(row, fields) { return fields ? Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[column.key]])) : { ...row }; }
  function deferred(run) { return { then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject), returning: fields => Promise.resolve().then(() => run().map(row => project(row, fields))) }; }
  function connection(releases = []) {
    return {
      select(fields) { return { from(table) { let clause; let take = Infinity; const query = { where(value) { clause = value; return query; }, limit(value) { take = value; return query; }, orderBy() { return query; }, for() { return query; }, then(resolve, reject) { return Promise.resolve().then(() => rows[table._name].filter(row => matches(row, clause)).slice(0, take).map(row => project(row, fields))).then(resolve, reject); } }; return query; } }; },
      update(table) { return { set(values) { return { where(clause) { return deferred(() => { const selected = rows[table._name].filter(row => matches(row, clause)); for (const row of selected) { const applied = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value?.kind === "sql" && value.text.includes("CASE WHEN") ? row.status === "pending" ? "initiated" : row.status : value])); writes.push({ table: table._name, values: applied }); Object.assign(row, applied); } return selected; }); } }; } }; },
      insert(table) { return { values(value) { let conflict; const query = deferred(() => { const input = Array.isArray(value) ? value : [value]; const added = []; for (const item of input) { const keys = conflict ? (Array.isArray(conflict) ? conflict : [conflict]) : []; if (keys.length && rows[table._name].some(row => keys.every(column => row[column.key] === item[column.key]))) continue; const row = { id: rows[table._name].length + 1, ...item }; rows[table._name].push(row); writes.push({ table: table._name, values: row }); added.push(row); } return added; }); query.onConflictDoNothing = options => { conflict = options?.target; return query; }; return query; } }; },
      delete(table) { return { where: clause => deferred(() => { const removed = rows[table._name].filter(row => matches(row, clause)); rows[table._name] = rows[table._name].filter(row => !matches(row, clause)); return removed; }) }; },
      async execute(query) { const key = query.values[0]; const prior = locks.get(key) || Promise.resolve(); let release; const held = new Promise(resolve => { release = resolve; }); locks.set(key, prior.then(() => held)); await prior; releases.push(release); },
      async transaction(callback) { const held = []; try { return await callback(connection(held)); } finally { for (const release of held.reverse()) release(); } },
    };
  }
  return { ...connection(), rows, writes };
}

export const isNull = column => ({ kind: "isNull", column });
export const gt = (column, value) => ({ kind: "gt", column, value });
