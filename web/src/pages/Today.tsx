/* Today: a greeting, a field to ask your library anything, and the few things worth doing next (review
 * what's due, carry on reading, a quiz, a first book to add). */
import { ArrowRight, ArrowUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { learn } from "../api";
import { go } from "../app/navigation";
import { Spinner } from "../components/feedback";
import { useLoad } from "../lib/useLoad";
import { under, useVaultEvents } from "../lib/useVaultEvents";

/** Each kind of suggestion keeps its pastel: butter for what's due, peach for reading, and so on. */
const TONE: Record<string, string> = {
  review: "butter",
  explain: "lavender",
  read: "peach",
  quiz: "sky",
  mixed: "sage",
};

export function Today() {
  const { data, error, reload } = useLoad(() => learn.today());
  useVaultEvents(reload, under("cards/", "notes/", "concepts/"));
  const [question, setQuestion] = useState("");
  if (error) return <div className="center-note">Could not load today: {error}</div>;
  if (!data)
    return (
      <div className="center-note">
        <Spinner label="Opening" />
      </div>
    );
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const next = [
    ...(data.books.length
      ? []
      : [
          {
            title: "Add your first book",
            detail: "A textbook, a paper, lecture notes.",
            href: "#/library",
            tone: "sage",
          },
        ]),
    ...data.suggestions.map((s) => {
      const { route, ...query } = s.action;
      const params = new URLSearchParams(query).toString();
      return { title: s.title, detail: s.detail, href: `${route}${params ? `?${params}` : ""}`, tone: TONE[s.kind] };
    }),
  ];
  return (
    <div className="today rise">
      <h1 className="today-greeting">
        {greeting}
        {data.profile.name ? `, ${data.profile.name}` : ""}.
      </h1>
      <form
        className="ask-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) go(`#/ask?q=${encodeURIComponent(question.trim())}`);
        }}
      >
        <Sparkles className="ask-icon" aria-hidden="true" />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask your library anything…"
          aria-label="Ask your library"
        />
        <button className="icon-button ask-send" type="submit" aria-label="Ask" disabled={!question.trim()}>
          <ArrowUp aria-hidden="true" />
        </button>
      </form>
      {next.length > 0 && (
        <section className="next" aria-labelledby="next-title">
          <h2 className="next-label" id="next-title">
            Up next
          </h2>
          <ul className="next-list stagger">
            {next.map((item) => (
              <li key={item.href + item.title}>
                <a className="next-row" href={item.href}>
                  <span className="next-dot" data-tone={item.tone || "lavender"} aria-hidden="true" />
                  <span className="next-text">
                    <span className="next-title">{item.title}</span>
                    <span className="next-detail">{item.detail}</span>
                  </span>
                  <ArrowRight className="next-go" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
