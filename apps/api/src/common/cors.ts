// Addresses that only exist on a local network: localhost, and the private IPv4 ranges
// (10.x.x.x, 172.16-31.x.x, 192.168.x.x). A phone on your Wi-Fi opens the app from one of these.
const PRIVATE_NETWORK_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

export interface CorsOptions {
  /** Origins allowed everywhere, e.g. the production website (FRONTEND_URL, comma separated). */
  configured: string[];
  production: boolean;
}

export function parseConfiguredOrigins(value: string | undefined): string[] {
  const list = (value ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  return list.length ? list : ['http://localhost:3000'];
}

/**
 * Decides whether a browser page at `origin` may call this API.
 * Production only trusts the configured website(s). Outside production, any private-network address is
 * also trusted so the app can be tested from a phone or another computer on the same network.
 */
export function isAllowedOrigin(origin: string | undefined, { configured, production }: CorsOptions): boolean {
  // Requests without an Origin header (curl, server-to-server, same-origin) are not subject to CORS.
  if (!origin) return true;
  if (configured.includes(origin)) return true;
  return !production && PRIVATE_NETWORK_ORIGIN.test(origin);
}
