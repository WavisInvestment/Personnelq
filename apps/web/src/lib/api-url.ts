const API_PORT = process.env.NEXT_PUBLIC_API_PORT || '3001';

/**
 * Where the browser should send API requests.
 *
 * An explicit NEXT_PUBLIC_API_URL always wins (use it in production, where the API has its own address).
 * Otherwise the API is assumed to be on the same machine as the page, so the address is derived from the
 * page's own host. That way http://localhost:3000, http://192.168.1.100:3000 (a phone on your Wi-Fi) and a
 * teammate's machine all reach the right API, instead of every device calling its own "localhost".
 */
export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}/api/v1`;
  }
  return `http://localhost:${API_PORT}/api/v1`;
}
