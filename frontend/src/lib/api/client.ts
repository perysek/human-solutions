export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Thin fetch wrapper — every call goes through the Vite dev proxy to the
 * Flask backend (see vite.config.ts), `credentials: 'include'` so the
 * Flask-Login session cookie rides along. JSON in, JSON out; non-2xx
 * responses throw ApiError with the backend's `error`/`message` field.
 *
 * Pass the backend's real path (e.g. '/system/users/api', '/employees/api',
 * '/auth/login') — there is no single '/api' base. The backend's routes
 * live under a few distinct prefixes (see vite.config.ts's proxy comment
 * for why), not one common namespace.
 *
 * X-Requested-With is set so the backend's `_wants_json()` helper
 * (config/auth_config.py) recognizes this as an API call and returns a JSON
 * 403/redirect-free response on permission checks, instead of the
 * flash+redirect(HTML) path meant for full-page form submits. Plain fetch()
 * doesn't send this header on its own.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ?? body.message ?? message;
    } catch {
      /* non-JSON error body — keep statusText */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
