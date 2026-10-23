const API = "http://localhost:4000";

// One helper for every backend call. "credentials: include" sends the login cookie.
export async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(API + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}