/* The fetch helpers every API call goes through: JSON in and out, and the server's error message
 * (written for the learner) thrown as the Error's message. */

/** Fetches `path` and returns its JSON; throws the server's error message when the response isn't ok. */
export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `${response.status} ${response.statusText}`);
  return data as T;
}
export const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const put = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
export const del = (path: string) => call(path, { method: "DELETE" });
