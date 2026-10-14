/* An animation's still, found by its code (the server names stills by a hash of it; see
 * server/manim/poster.ts) and drawn on first need, once per session, when it has none yet. */
import { useEffect, useState } from "react";
import { post } from "../api/client";

const asked = new Set<string>();

async function hashOf(code: string) {
  const bytes = new TextEncoder().encode(code.replace(/\r\n/g, "\n").trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

const loads = (url: string) =>
  new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });

/** The URL of an animation's still in a theme, once there is one (null until then, or if it can't be drawn). */
export function usePoster(code: string, theme: "light" | "dark"): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    void (async () => {
      if (!crypto?.subtle) return;
      const hash = await hashOf(code);
      const src = `/api/manim/poster/${hash}-${theme}.webp`;
      if (await loads(src)) return alive && setUrl(src);
      if (asked.has(hash)) return;
      asked.add(hash);
      const made = await post<{ ok: boolean }>("/api/manim/posters", { code }).catch(() => null);
      if (made?.ok && alive && (await loads(src))) setUrl(src);
    })();
    return () => {
      alive = false;
    };
  }, [code, theme]);
  return url;
}
