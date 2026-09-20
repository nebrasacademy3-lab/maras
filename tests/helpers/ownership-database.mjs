/** Strict, isolated SQL boundary for executing account-ownership routes without live services. */
import assert from "node:assert/strict";
export const sql = (strings, ...values) => ({ kind: "sql", text: strings.join("?"), values });
export const eq = (column, value) => ({ kind: "eq", column, value });
export const inArray = (column, value) => ({ kind: "inArray", column, value });
export const gt = (column, value) => ({ kind: "gt", column, value });
export const isNull = column => ({ kind: "isNull", column });
export const and = (...clauses) => ({ kind: "and", clauses });
export const or = (...clauses) => ({ kind: "or", clauses });
export function ownershipDatabase(names, initial = {}) {
  const tables = Object.fromEntries(names.map(name => [name, new Proxy({ _name: name }, {
    get: (target, key) => key === "_name" ? target._name : { table: name, key },
  })]));
  const rows = Object.fromEntries(names.map(name => [name, structuredClone(initial[name] || [])]));
  const writes = [], locks = [], reads = [];
  let inTransaction = false, committed = false;
  function matches(row, clause) {
    if (!clause) return true;
    if (clause.kind === "and") return clause.clauses.every(item => matches(row, item));
    if (clause.kind === "or") return clause.clauses.some(item => matches(row, item));
    const value = row[clause.column?.key];
    if (clause.kind === "eq") return value === clause.value;
    if (clause.kind === "gt") return value > clause.value;
    if (clause.kind === "isNull") return value == null;
    if (clause.kind === "inArray") return clause.value.includes(value);
    throw new Error("Unsupported ownership predicate: " + JSON.stringify(clause));
  }
  const project = (row, fields) => fields ? Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[column.key]])) : { ...row };
  const deferred = run => {
    let result;
    const once = () => result ??= Promise.resolve().then(run);
    return { then: (resolve, reject) => once().then(resolve, reject), returning: fields => once().then(values => values.map(row => project(row, fields))) };
  };
  const db = {
    select(fields) { return { from(table) {
      let clause, maximum = Infinity;
      const query = { where(value) { clause = value; return query; }, limit(value) { maximum = value; return query; }, orderBy() { return query; }, for() { return query; },
        then(resolve, reject) { return Promise.resolve().then(() => { reads.push({ table: table._name, clause }); return rows[table._name].filter(row => matches(row, clause)).slice(0, maximum).map(row => project(row, fields)); }).then(resolve, reject); } };
      return query;
    } }; },
    insert(table) { return { values(values) {
      let conflict, update;
      const query = deferred(() => {
        const output = [];
        for (const value of Array.isArray(values) ? values : [values]) {
          const columns = conflict ? Array.isArray(conflict) ? conflict : [conflict] : [];
          const previous = columns.length ? rows[table._name].find(row => columns.every(column => row[column.key] === value[column.key])) : undefined;
          if (previous) { if (update) { Object.assign(previous, update); output.push(previous); writes.push({ table: table._name, operation: "upsert", values: { ...update }, conflict: columns.map(column => column.key) }); } continue; }
          const row = { id: 1 + Math.max(0, ...rows[table._name].map(row => Number(row.id) || 0)), ...value };
          rows[table._name].push(row); output.push(row); writes.push({ table: table._name, operation: "insert", values: { ...row }, conflict: columns.map(column => column.key) });
        }
        return output;
      });
      query.onConflictDoNothing = options => { conflict = options?.target; return query; };
      query.onConflictDoUpdate = options => { conflict = options.target; update = options.set; return query; };
      return query;
    } }; },
    update(table) { return { set(values) { return { where(clause) { return deferred(() => {
      const selected = rows[table._name].filter(row => matches(row, clause));
      for (const row of selected) { Object.assign(row, values); writes.push({ table: table._name, operation: "update", values: { ...values }, id: row.id }); }
      return selected;
    }); } }; } }; },
    delete(table) { return { where(clause) { return deferred(() => {
      const removed = rows[table._name].filter(row => matches(row, clause));
      rows[table._name] = rows[table._name].filter(row => !matches(row, clause));
      for (const row of removed) writes.push({ table: table._name, operation: "delete", id: row.id });
      return removed;
    }); } }; },
    async execute(query) { assert.match(query.text, /^SELECT pg_advisory_xact_lock/); assert.ok(inTransaction); locks.push(...query.values); return { rows: [] }; },
    async transaction(callback) {
      assert.equal(inTransaction, false, "fixture supports one transaction at a time");
      const snapshot = structuredClone(rows), mark = writes.length;
      inTransaction = true;
      try { const value = await callback(db); committed = true; return value; }
      catch (error) { for (const name of names) rows[name] = snapshot[name]; writes.splice(mark); throw error; }
      finally { inTransaction = false; }
    },
  };
  return { db, rows, tables, writes, locks, reads, inTransaction: () => inTransaction, committed: () => committed };
}
