/** Authorization uses the owning order/account, never these historical display values. */
export function invoiceCustomerSnapshot(
  invoice: { snapshotJson?: string | null; customerEmail: string },
  legacy: { customerName: string; customerPhone?: string | null },
) {
  let customer: Record<string, unknown> = {};
  try {
    const value: unknown = invoice.snapshotJson ? JSON.parse(invoice.snapshotJson) : null;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = (value as Record<string, unknown>).customer;
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) customer = candidate as Record<string, unknown>;
    }
  } catch { /* Older legacy invoices may lack a valid snapshot. */ }
  const text = (value: unknown, fallback: string) => typeof value === "string" ? value : fallback;
  return {
    name: text(customer.name, legacy.customerName),
    email: text(customer.email, invoice.customerEmail),
    phone: text(customer.phone, legacy.customerPhone || ""),
  };
}
