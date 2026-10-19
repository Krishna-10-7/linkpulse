// Thin fetch wrapper. Every call goes to <BASE_PATH>/api with the session cookie.

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '/lk';
export const APP = `${BASE}/app`;

export type Issue = { field: string; code: string; message: string; existing?: string };

export class ApiError extends Error {
  status: number;
  code: string;
  data: any;
  constructor(status: number, body: any) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code || 'error';
    this.data = body?.error || {};
  }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.includes('/login') && !location.pathname.includes('/register')) {
      location.href = `${APP}/login/?next=${encodeURIComponent(location.pathname + location.search)}`;
    }
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
