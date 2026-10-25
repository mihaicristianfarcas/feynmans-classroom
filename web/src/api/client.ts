/* The fetch helpers every API call goes through: JSON in and out, and the server's error message
 * (written for the learner) thrown as the Error's message. Each call says which vault the page shows;
 * the server answers one still showing a vault that has been closed with 409, and the page hears of it
 * ("classroom:vault-changed") to load the open one. Once the page is leaving for another vault, it asks
 * nothing more. */

/** The vault this page shows, once known. */
let shown: string | null = null;
/** Says which vault this page shows (the open one, when it started). */
export const showVault = (id: string) => {
  shown = id;
};
export const shownVault = () => shown;

let leaving = false;
/** The page is starting again in another vault: what it would still ask is for the one it leaves. */
export const leaveVault = () => {
  leaving = true;
};

/** Fetches `path` and returns its JSON; throws the server's error message when the response isn't ok. */
export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  // never answered: the page is about to load again
  if (leaving) return new Promise<T>(() => {});
  const headers = new Headers(init?.headers);
  if (shown) headers.set("x-vault", shown);
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status === 409 && data?.vault) window.dispatchEvent(new Event("classroom:vault-changed"));
  if (!response.ok) throw new Error(data?.error || `${response.status} ${response.statusText}`);
  return data as T;
}
export const post = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const put = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
export const patch = <T>(path: string, body?: unknown) =>
  call<T>(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
export const del = (path: string) => call(path, { method: "DELETE" });
