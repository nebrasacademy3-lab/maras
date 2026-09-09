/** Copy without letting unsupported/denied clipboard access reject a UI event. */
export async function copyBrowserText(value: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; } } catch { /* Try the selection-based fallback for restricted browsers. */ }
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.setAttribute("aria-label", "النص المراد نسخه");
  field.style.cssText = "position:fixed;inset:0 auto auto 0;width:1px;height:1px;opacity:0";
  document.body.append(field);
  try { field.select(); field.setSelectionRange(0, value.length); return document.execCommand("copy"); } catch { return false; }
  finally { field.remove(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); }
}

export async function shareBrowserLink(input: ShareData): Promise<"shared" | "cancelled" | "fallback"> {
  if (typeof navigator.share !== "function") return "fallback";
  try { await navigator.share(input); return "shared"; }
  catch (error) { return error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "fallback"; }
}
