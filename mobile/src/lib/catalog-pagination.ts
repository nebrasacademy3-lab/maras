export function catalogPage<T>(rows: readonly T[], query: string, page: number, searchable: (row: T) => string, size = 25) {
  const limit = Math.max(1, Math.min(100, Math.trunc(size) || 25));
  const term = query.trim().toLocaleLowerCase();
  const filtered = term ? rows.filter(row => searchable(row).toLocaleLowerCase().includes(term)) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / limit));
  const current = Math.max(0, Math.min(pages - 1, Math.trunc(page) || 0));
  return { items: filtered.slice(current * limit, (current + 1) * limit), current, pages, total: filtered.length };
}
