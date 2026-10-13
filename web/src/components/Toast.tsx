/* A short message at the bottom of the window ("Added to your note. Open"), announced to screen
 * readers, that goes away by itself. */
import { useCallback, useEffect, useRef, useState } from "react";

interface ToastMessage {
  text: string;
  action?: { label: string; href: string };
}

/** The message on show and `say` to show one (for `ms` milliseconds). */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = useCallback((text: string, action?: ToastMessage["action"], ms = 3500) => {
    setToast({ text, action });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, say };
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      {toast.text}
      {toast.action && (
        <a className="toast-action" href={toast.action.href}>
          {toast.action.label}
        </a>
      )}
    </div>
  );
}
