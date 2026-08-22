export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso.replace(" ", "T") + "Z").getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function logClass(line: string): string {
  if (line.startsWith("✔") || line.includes("APPROVED")) return "log-line ok";
  if (line.startsWith("✘") || line.includes("REJECTED")) return "log-line bad";
  if (line.startsWith("⚕") || line.trimStart().startsWith("⚕")) return "log-line warn";
  return "log-line";
}
