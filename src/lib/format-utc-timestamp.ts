/** Render an instant identically during server rendering and browser hydration. */
export function formatUtcTimestamp(value: string): string {
  const iso = new Date(value).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
