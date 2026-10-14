/* Where the learner is when they open the agent: read from the page's address (the note, the concept,
 * the book and the place in it) and the text selected on the page, taken before focus moves to the
 * panel. The server looks up the rest (titles, the chapter, its text file). */
import type { AgentContext } from "../api";

/** The context of the page as it is now. */
export function currentContext(): AgentContext {
  const hash = location.hash || "#/";
  const [path, query] = hash.split("?");
  const context: AgentContext = { route: hash };
  const note = /^#\/notes\/([^/?]+)/.exec(path);
  const concept = /^#\/brain\/concept\/([^/?]+)/.exec(path);
  const book = /^#\/book\/([a-z0-9]+)/i.exec(path);
  if (note || concept) context.docId = decodeURIComponent((note || concept)![1]);
  else if (book) {
    context.bookId = book[1];
    const at = new URLSearchParams(query || "").get("at");
    if (at !== null && Number.isFinite(Number(at))) context.at = Number(at);
  }
  const selection = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
  if (selection) context.selection = selection.slice(0, 4000);
  return context;
}

/** A few words for what the agent will know about where they are, before the request is sent. */
export function contextLabel(context: AgentContext | null): string {
  if (!context) return "";
  const parts: string[] = [];
  if (context.docId) parts.push(/^#\/brain\/concept\//.test(context.route || "") ? "this concept" : "this note");
  if (context.bookId) parts.push(context.at !== undefined ? "this book, where you are in it" : "this book");
  if (context.selection) {
    const words = context.selection.split(" ").length;
    parts.push(`the selection (${words} word${words === 1 ? "" : "s"})`);
  }
  return parts.join(", ");
}

/** The context without the page's specifics (the learner chose to leave them out). */
export const withoutPlace = (context: AgentContext | null): AgentContext => ({ route: context?.route });
