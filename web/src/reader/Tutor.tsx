/* The reader's tutor: a conversation about the chapter, or a passage pinned to it, in the same chat as a
 * margin card's follow-ups, answering directly or Socratically. Each conversation is a session kept with
 * the book (server/learn/sessions.ts): saved after every reply, listed when a new one starts, and opened
 * again to read or carry on. A session can be written up as a note (in the active vault), or made into cards. */
import { Layers, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { transcript } from "../../../shared/thread.ts";
import { type Book, docs, learn, type SourceRef, type TocEntry, type TutorSession } from "../api";
import { ChatInput, type ChatMessage, ChatThread } from "../components/Chat";
import { CardDrafter } from "../components/tools";
import { useIndicator } from "../components/ui";
import { announce } from "../lib/a11y";
import { timeAgo } from "../lib/time";
import { useLoad } from "../lib/useLoad";
import { useVaultEvents } from "../lib/useVaultEvents";
import { activeVault } from "../vaults/active";
import { noteRoute } from "../vaults/routes";

export type TutorMessage = ChatMessage;

/** Where a session's note opens: in its vault (older sessions' notes were moved into one). */
const noteHref = (n: { vault?: string; path?: string }) =>
  n.vault && n.path ? noteRoute(n.vault, n.path) : "#/vaults";

/** The conversation on screen: its messages, and the session file it is saved in (once there is one). */
export interface TutorConversation {
  messages: TutorMessage[];
  sessionId: string | null;
  mode: "answer" | "socratic";
}
export const NEW_CONVERSATION: TutorConversation = { messages: [], sessionId: null, mode: "answer" };

/** The passage a session was about (its source's quote), pinned again when it is reopened. */
export const pinnedOf = (s: TutorSession) => (s.source.quote ? { text: s.source.quote, source: s.source } : null);

export function TutorTab({
  book,
  chapter,
  pinned,
  setPinned,
  theme,
  conversation,
  setConversation,
  say,
}: {
  book: Book;
  chapter: TocEntry | null;
  pinned: { text: string; source: SourceRef } | null;
  setPinned: (p: { text: string; source: SourceRef } | null) => void;
  theme: "light" | "dark";
  conversation: TutorConversation;
  setConversation: (c: TutorConversation) => void;
  /** Shows a short message (the reader's toast). */
  say: (text: string, action?: { label: string; href: string }) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [cards, setCards] = useState(false);
  const { messages, mode } = conversation;
  const modes = useIndicator<HTMLFieldSetElement>(mode);
  const end = useRef<HTMLDivElement>(null);
  const { data: sessions, reload } = useLoad(() => learn.sessions(book.id), [book.id]);
  useVaultEvents(reload, (path) => path.includes("/sessions/"));
  const source: SourceRef = pinned?.source || { bookId: book.id, chapterId: chapter?.id };
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls to the newest message when one arrives or the tutor starts answering
  useEffect(() => {
    // a block, not an expression: scrollIntoView returns a promise in recent browsers
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const next: TutorMessage[] = [...messages, { role: "user", text: text.trim() }];
    setConversation({ ...conversation, messages: next });
    setInput("");
    setBusy(Date.now());
    try {
      const { reply, session } = await learn.tutor({
        messages: next,
        passage: pinned?.text,
        source,
        mode,
        sessionId: conversation.sessionId || undefined,
      });
      setConversation({
        messages: [...next, { role: "tutor", text: reply }],
        sessionId: session?.id || conversation.sessionId,
        mode,
      });
      reload();
    } catch (e) {
      setConversation({ ...conversation, messages: [...next, { role: "tutor", text: `_${(e as Error).message}_` }] });
    } finally {
      setBusy(null);
    }
  };
  const open = (session: TutorSession) => {
    setConversation({ messages: session.messages, sessionId: session.id, mode: session.mode });
    setPinned(pinnedOf(session));
  };
  const others = (sessions || []).filter((s) => s.id !== conversation.sessionId);
  const current = (sessions || []).find((s) => s.id === conversation.sessionId);
  const writeNote = async () => {
    if (!conversation.sessionId) return;
    setWriting(true);
    announce("Writing a note from this session.");
    try {
      const { vaultNote } = await learn.sessionNote(conversation.sessionId, await activeVault());
      reload();
      say(`Saved as “${vaultNote.title}”.`, { label: "Open", href: noteHref(vaultNote) });
    } catch (e) {
      say((e as Error).message);
    } finally {
      setWriting(false);
    }
  };
  return (
    <div className="tutor">
      <div className="tutor-scroll">
        {messages.length > 0 && (
          <div className="tutor-bar">
            <span className="fine">{conversation.sessionId ? "Saved with the book" : "Not saved yet"}</span>
            <span className="spacer" />
            {conversation.sessionId &&
              (current?.note ? (
                <a className="button subtle" href={noteHref(current.note)} title={current.note.title}>
                  <NotebookPen aria-hidden="true" />
                  Open note
                </a>
              ) : (
                <button
                  type="button"
                  className="button subtle"
                  disabled={writing || !!busy}
                  aria-busy={writing || undefined}
                  title="Write what you worked out here as a note of your own"
                  onClick={writeNote}
                >
                  <NotebookPen aria-hidden="true" />
                  {writing ? "Writing note…" : "Save as note"}
                </button>
              ))}
            {conversation.sessionId && (
              <button
                type="button"
                className="button subtle"
                disabled={!!busy}
                title="Flashcards on what this session explained"
                onClick={() => setCards(true)}
              >
                <Layers aria-hidden="true" />
                Make cards
              </button>
            )}
            <button
              type="button"
              className="button subtle"
              onClick={() => {
                setConversation({ ...NEW_CONVERSATION, mode });
                setPinned(null);
              }}
            >
              <Plus aria-hidden="true" />
              New session
            </button>
          </div>
        )}
        {pinned ? (
          <div className="pinned">
            <span className="eyebrow">About this passage</span>
            <blockquote className="quote">
              {pinned.text.length > 300 ? `${pinned.text.slice(0, 300)}…` : pinned.text}
            </blockquote>
            {messages.length === 0 && (
              <button type="button" className="link" onClick={() => setPinned(null)}>
                Ask about the whole chapter instead
              </button>
            )}
          </div>
        ) : (
          messages.length === 0 && (
            <p className="fine">
              Ask anything about {chapter ? `“${chapter.title}”` : "this book"}. Select a passage and choose Ask the
              tutor to talk about it specifically. Every conversation is kept with the book.
            </p>
          )
        )}
        {messages.length === 0 && (
          <div className="starters">
            {[
              "Explain this like I'm new to it",
              "Why does this matter?",
              "Give me a concrete example",
              "What's the most common misconception here?",
            ].map((s) => (
              <button type="button" key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <ChatThread messages={messages} theme={theme} busy={busy} />
        {messages.length === 0 && others.length > 0 && (
          <section className="sessions" aria-labelledby="sessions-title">
            <h2 className="sub-title" id="sessions-title">
              Earlier sessions
            </h2>
            <ul className="session-list">
              {others.map((s) => (
                <li key={s.id}>
                  <button type="button" className="session-item" onClick={() => open(s)}>
                    <span className="session-title">{s.title}</span>
                    <span className="session-meta">
                      {[
                        book.toc.find((c) => c.id === s.source.chapterId)?.title,
                        `${s.messages.filter((m) => m.role === "user").length} question${s.messages.filter((m) => m.role === "user").length === 1 ? "" : "s"}`,
                        timeAgo(s.updated),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Delete"
                    aria-label={`Delete “${s.title}”`}
                    onClick={async () => {
                      if (!confirm(`Delete the session “${s.title}”?`)) return;
                      await docs.remove(s.id);
                      reload();
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div ref={end} />
      </div>
      <ChatInput
        className="tutor-input"
        value={input}
        onChange={setInput}
        onSend={send}
        busy={!!busy}
        label="Your question for the tutor"
        placeholder={mode === "socratic" ? "Ask, and the tutor will guide you to it…" : "Ask the tutor…"}
      >
        <fieldset className="segmented" ref={modes}>
          <legend className="visually-hidden">Tutor style</legend>
          <button
            type="button"
            aria-pressed={mode === "answer"}
            onClick={() => setConversation({ ...conversation, mode: "answer" })}
          >
            Answer me
          </button>
          <button
            type="button"
            aria-pressed={mode === "socratic"}
            onClick={() => setConversation({ ...conversation, mode: "socratic" })}
            title="The tutor asks questions that lead you to the answer"
          >
            Socratic
          </button>
        </fieldset>
      </ChatInput>
      {cards && (
        <CardDrafter
          passage={transcript(messages)}
          quote={false}
          title="Flashcards from this session"
          focus="cards on the ideas this conversation with the tutor explained (not on the conversation itself)"
          source={source}
          deck={book.title}
          onClose={() => setCards(false)}
        />
      )}
    </div>
  );
}
