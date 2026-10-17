/** Quote every field and prevent names/notes from being interpreted as spreadsheet formulas. */
export function reportCsvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  const safe = typeof value === "string" && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
