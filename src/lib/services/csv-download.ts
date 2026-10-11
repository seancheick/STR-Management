/** ASCII header filename plus the original Unicode name for supporting browsers. */
export function csvDownloadDisposition(label: string) {
  const name = `payout-${label.replace(/\s+/g, "-").toLowerCase()}.csv`;
  const fallback = name.replace(/[^a-z0-9._-]/g, "-");
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
