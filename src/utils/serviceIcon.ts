/**
 * Build a public URL for a service icon file under `iconBaseUrl`.
 * Flat names live directly under `public/`; nested paths are URL-encoded
 * segment-by-segment so spaces and special characters resolve correctly.
 */
export function serviceIconPublicUrl(base: string, file: string): string {
  const b = base.replace(/\/$/, "");
  if (file.includes("/")) {
    return `${b}/${file.split("/").map(encodeURIComponent).join("/")}`;
  }
  const name = file.includes(".") ? file : `${file}.svg`;
  return `${b}/${encodeURIComponent(name)}`;
}
