/* Times as people say them. */

/** "just now", "5 min ago", "3 h ago", "2 d ago", or the date. */
export function timeAgo(ts: number | string) {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}
