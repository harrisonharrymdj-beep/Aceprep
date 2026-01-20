// src/lib/api.ts

export async function safePostJSON<T = any>(
  url: string,
  body: any,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...init,
  });

  // Always read text first
  const text = await res.text();

  let data: any = null;

  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      // Server responded with non-JSON (or truncated JSON)
      throw new Error(
        `Server returned non-JSON (${res.status}): ${text.slice(0, 200)}`
      );
    }
  }

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }

  return data as T;
}
