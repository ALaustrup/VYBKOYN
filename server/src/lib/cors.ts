import type cors from "cors";

/** Allow localhost, 127.0.0.1, and LAN IPs on dev ports (Next.js :3000). */
function isDevBrowserOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (!["3000", "3001"].includes(port)) return false;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

export function resolveCorsOrigin():
  | cors.CorsOptions["origin"]
  | boolean
  | string
  | string[] {
  const listed =
    process.env.CORS_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  if (process.env.NODE_ENV !== "production") {
    return (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (listed.includes(origin) || isDevBrowserOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    };
  }

  return listed.length > 0 ? listed : true;
}
