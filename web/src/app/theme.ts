/* Light and dark: the theme the learner chose (kept in localStorage), else the system's, followed as
 * it changes; choosing "system" goes back to following it. index.html applies it before the first
 * paint; switching crossfades. */
import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type ThemeChoice = "light" | "dark" | "system";

const savedTheme = (): "light" | "dark" | null => {
  try {
    const saved = localStorage.getItem("classroom-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return null;
};
const systemTheme = (): "light" | "dark" =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** What the learner chose: a theme, or the system's. */
export const themeChoice = (): ThemeChoice => savedTheme() ?? "system";

/** The theme: the one you chose, else the system's (followed as it changes). Switching crossfades. */
export function useTheme(): ["light" | "dark", (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState<"light" | "dark">(() => savedTheme() ?? systemTheme());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => !savedTheme() && setTheme(systemTheme());
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  const choose = useCallback((choice: ThemeChoice) => {
    try {
      if (choice === "system") localStorage.removeItem("classroom-theme");
      else localStorage.setItem("classroom-theme", choice);
    } catch {}
    const next = choice === "system" ? systemTheme() : choice;
    const apply = () => {
      document.documentElement.dataset.theme = next;
      flushSync(() => setTheme(next));
    };
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      doc.startViewTransition(apply);
    else apply();
  }, []);
  return [theme, choose];
}
