/** Published catalog visibility is checked upstream. Thin, empty pages stay noindex. */
export function specialtyIsIndexable(description: string, courseCount: number): boolean {
  return courseCount > 0 || description.trim().replace(/\s+/g, " ").length >= 100;
}
