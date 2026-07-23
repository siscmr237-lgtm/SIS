const runtimeApiUrl =
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_API_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:4000/api';
const BASE_URL = runtimeApiUrl;

function clearSessionAndRedirect(genuineExpiry: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('auth_token');
  window.localStorage.removeItem('user');
  window.location.replace(genuineExpiry ? '/login?reason=expired' : '/login');
}

// The only /auth/ endpoints reachable with no session yet — every other /auth/
// route (otp/send-code, pending-email, otp/verify-signup, ...) requires the
// caller's own authenticated session, never a raw client-supplied identifier.
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/signup'];

async function request(path: string, init?: RequestInit) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const sentWithToken = Boolean(token) && !PUBLIC_AUTH_PATHS.includes(path);
  if (sentWithToken) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { headers, ...init });
  } catch {
    const err = new Error('Network error') as Error & { status: number; code: string };
    err.status = 0;
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed: ${res.status}`;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) message = String(parsed.error);
      if (parsed.code) code = String(parsed.code);
    } catch {}

    // A 401 only means a session genuinely died if we actually believed we had one
    // (i.e. this call went out with a token attached). A call that went out with no
    // token — e.g. a straggling effect that fires right after an intentional logout
    // already cleared it — has nothing to "expire"; don't show that banner for it.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      clearSessionAndRedirect(sentWithToken);
    }

    const err = new Error(message) as Error & { status: number; code?: string };
    err.status = res.status;
    err.code = code;
    throw err;
  }

  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) return res.json();
  return null;
}

export const api = {
  get: (path: string, init?: RequestInit) => request(path, init),
  post: (path: string, body: any) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path: string, body: any) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path: string, body: any) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};

export { BASE_URL };
