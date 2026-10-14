/* A conversation, drawn the same way wherever one happens (the tutor, follow-ups on a margin card):
 * your messages as dark bubbles on the right, the answers on the left, a spinner while one is being
 * written, and a field that grows as you type (Enter sends, Shift+Enter starts a new line). */
import { ArrowUp } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import type { Turn } from "../../../shared/thread.ts";
import { Spinner } from "./feedback";
import { Markdown } from "./Markdown";

export type ChatMessage = Turn;

/** The messages of a conversation, oldest first; `busy` (a start time) shows the answer being written. */
export function ChatThread({
  messages,
  theme,
  busy,
  base,
}: {
  messages: ChatMessage[];
  theme: "light" | "dark";
  busy?: number | null;
  /** The vault path the answers belong to, for relative links in them. */
  base?: string;
}) {
  return (
    <>
      {messages.map((m, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: messages are only appended
          key={i}
          className="msg"
          data-role={m.role}
        >
          {m.role === "tutor" ? <Markdown text={m.text} theme={theme} base={base} /> : <p>{m.text}</p>}
        </div>
      ))}
      {busy ? <Spinner label="Thinking" since={busy} /> : null}
    </>
  );
}

/** The field a message is written in, with its send button; `children` go in a row under it. */
export function ChatInput({
  value,
  onChange,
  onSend,
  placeholder,
  label,
  busy,
  children,
  className = "",
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => void;
  placeholder: string;
  label: string;
  busy?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  // grows with what is written, up to a few lines (then it scrolls)
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever the text changes
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);
  const send = () => {
    if (value.trim() && !busy) onSend(value.trim());
  };
  return (
    <form
      className={`chat-input ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="chat-field">
        <textarea
          ref={field}
          rows={1}
          value={value}
          aria-label={label}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="chat-send"
          type="submit"
          disabled={!value.trim() || busy}
          aria-label="Send"
          title="Send (Enter)"
        >
          {busy ? <span className="spinner-mark" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
        </button>
      </div>
      {children && <div className="chat-tools">{children}</div>}
    </form>
  );
}
