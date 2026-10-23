/**
 * The single HTTP boundary between this app and the Task Board backend.
 *
 * Everything about the backend's wire format is handled here and nowhere else:
 *   - understands the backend's actual JSON responses (raw objects with message/data fields)
 *   - sends the httpOnly authentication cookie on every request
 *   - 204 No Content on DELETE (no body to parse)
 *   - includes the session cookie on authenticated routes
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** An error carrying the HTTP status, so callers can branch on 401 / 503 / 404. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** The voice endpoints return 503 when GROQ_API_KEY isn't set on the server. */
  get isVoiceUnavailable(): boolean {
    return this.status === 503;
  }
}

/*
 * Authentication uses the backend's httpOnly cookie. The browser manages it;
 * JavaScript intentionally never reads or stores the JWT.
 */
let onUnauthorized: (() => void) | null = null;

/** Lets AuthProvider log the user out when the backend rejects an expired token. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** JSON body. Ignored when `formData` is provided. */
  body?: unknown;
  /** Multipart body — used only by the voice endpoints, which take an audio file. */
  formData?: FormData;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, signal } = options;

  const headers: Record<string, string> = {};
  // Let the browser set the multipart Content-Type (it must append the boundary).
  if (body !== undefined && !formData) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (error) {
    // Fetch only rejects on a genuine network failure (server down, DNS, CORS).
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }

  /*
   * A 401 means two completely different things depending on the route:
   *
   *   /api/auth/login    -> "those credentials are wrong" (a normal outcome —
   *                         the user was never signed in to begin with)
   *   everything else    -> "your token is missing or expired" (the session is
   *                         genuinely dead, so drop it and bounce to /login)
   *
   * Treating them the same made a failed login report "Your session has expired.
   * Please sign in again." to someone who had never signed in. Auth routes are
   * therefore exempt from the interceptor and fall through to the normal error
   * path, which surfaces the backend's own message verbatim.
   */
  const isAuthRoute = path.startsWith('/api/auth/');

  if (response.status === 401 && !isAuthRoute) {
    onUnauthorized?.();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  // DELETE /api/tasks/:taskId answers 204 with no body — parsing it would throw.
  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, 'The server returned an unreadable response.');
  }

  const envelope = payload as {
    success?: boolean;
    data?: T;
    message?: string;
    error?: { message?: string };
  };

  if (!response.ok || envelope.success === false) {
    throw new ApiError(
      response.status,
      envelope.error?.message ?? envelope.message ?? 'Something went wrong. Please try again.'
    );
  }

  // This Express backend returns resource objects directly (e.g. { user },
  // { projects }, { task }) rather than wrapping every response in { data }.
  return (envelope.success === true && 'data' in envelope ? envelope.data : payload) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', formData }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
};
