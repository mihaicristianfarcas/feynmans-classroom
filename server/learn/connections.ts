/* Connections an agent suggests between notes. It reads the vault with its own shell (the indexes
 * first, then rg and the files it needs) and proposes links worth following, each with a reason.
 * The learner accepts (the link goes into the note's `related` property, so Obsidian and agents see
 * it), rejects, or later removes one; every decision is kept in brain/connections.jsonl, so nothing
 * turned down is suggested again. With the "auto" setting the links are added straight away. */
import { linkKey, parseWikiLinks } from "../../shared/links.ts";
import type { Connection } from "../../shared/vault-types.ts";
import { agent } from "../llm.ts";
import { getSettings } from "../settings.ts";
import { listConnections, saveConnections } from "../vault/connections.ts";
import { changed, logActivity, notes, now, shortId, VAULT } from "../vault/index.ts";
import { writeIndexes } from "../vault/indexes.ts";
import { resolveLink } from "../vault/links.ts";
import { learnerSummary } from "./context.ts";
import { updateNote } from "./notes.ts";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "why"],
        properties: {
          from: { type: "string", description: "vault path of the note the link goes in, e.g. notes/Quorums.md" },
          to: { type: "string", description: "exact title of an existing note or concept to link to" },
          why: { type: "string", description: "one specific sentence: what following this link gives the learner" },
        },
      },
    },
  },
};

/** Links already in a note (in its text or its properties), as keys. */
function linkedFrom(path: string): Set<string> {
  const note = notes.byPath(path);
  if (!note) return new Set();
  const keys = new Set<string>();
  for (const l of [...parseWikiLinks(note.body), ...note.related.flatMap((r) => parseWikiLinks(r))]) {
    const r = resolveLink(l.target);
    keys.add(r ? r.node : linkKey(l.target));
  }
  return keys;
}

export async function suggestConnections(
  path?: string,
  opts: { onActivity?: (t: string) => void } = {},
): Promise<{ suggested: Connection[]; ms: number }> {
  if (path && !notes.byPath(path)) throw new Error("note not found");
  if (!path && !notes.items.size) return { suggested: [], ms: 0 };
  writeIndexes(); // the agent starts from the indexes: make sure they're current
  const recent = notes
    .list()
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 12)
    .map((n) => n.path);
  const prompt = `You are the learner's librarian, working in their knowledge vault (this folder). AGENTS.md explains the layout. Start from INDEX.md, notes/INDEX.md and concepts/INDEX.md; use rg to search notes/, concepts/ and the books' text (library/*/text/) for related ideas; open only the files you need.

Task: suggest links ${path ? `from the note \`${path}\`` : `from these recently edited notes: ${recent.map((p) => `\`${p}\``).join(", ")}`} to other notes or concepts that already exist in this vault, where following the link would genuinely help the learner: the same idea in another context, a prerequisite, a contrast, an application, an example of it.

Rules:
- Only link to notes and concepts that exist: use their exact titles (from the indexes).
- Skip links the note already has (check the note itself and brain/links.tsv).
- Skip anything in brain/connections.jsonl: it was already suggested or decided.
- At most ${path ? 6 : 10} suggestions, the most useful first; none is better than a weak one.
- Each "why" is one sentence about the actual content, not "both are about X".
- Don't modify any file.

The learner:
${learnerSummary()}

Return JSON.`;
  const result = await agent({
    cwd: VAULT,
    prompt,
    schema: SCHEMA,
    tier: "smart",
    effort: "low",
    onActivity: opts.onActivity,
  });
  const data = result.data as { suggestions: { from: string; to: string; why: string }[] };
  const list = listConnections();
  const decided = new Set(list.map((c) => `${c.from}\u0000${resolveLink(c.to)?.node || linkKey(c.to)}`));
  const auto = getSettings().connections === "auto";
  const added: Connection[] = [];
  for (const s of data.suggestions || []) {
    const from = (path || s.from || "").replace(/^\.\//, "");
    const note = notes.byPath(from);
    const target = resolveLink(s.to);
    if (!note || !target || target.node === `note:${note.id}` || !["note", "concept"].includes(target.kind)) continue;
    const key = `${from}\u0000${target.node}`;
    if (decided.has(key) || linkedFrom(from).has(target.node)) continue;
    decided.add(key);
    const c: Connection = {
      id: shortId("c"),
      from,
      to: target.title,
      why: s.why.trim().slice(0, 300),
      status: auto ? "accepted" : "suggested",
      by: { provider: result.provider, model: result.model },
      created: now(),
      ...(auto ? { decided: now() } : {}),
    };
    added.push(c);
    if (auto) addRelated(note.id, c.to);
  }
  if (added.length) {
    saveConnections([...list, ...added], `${added.length} connection${added.length === 1 ? "" : "s"}`);
    logActivity({
      type: "connect",
      text: `${auto ? "Linked" : "Suggested"} ${added.length} connection${added.length === 1 ? "" : "s"}${path ? ` for ${notes.byPath(path)?.title}` : ""}`,
    });
  }
  return { suggested: added, ms: result.ms };
}

function addRelated(noteId: string, to: string) {
  const note = notes.get(noteId);
  if (!note) return;
  const link = `[[${to}]]`;
  if (note.related.some((r) => linkKey(r.replace(/^\[\[|\]\]$/g, "")) === linkKey(to))) return;
  updateNote(noteId, { related: [...note.related, link] });
}

export function decideConnection(id: string, decision: "accept" | "reject" | "remove"): Connection {
  const list = listConnections();
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error("connection not found");
  const note = notes.byPath(c.from);
  if (decision === "accept") {
    if (!note) throw new Error("the note is gone");
    addRelated(note.id, c.to);
    c.status = "accepted";
  } else if (decision === "remove") {
    if (note)
      updateNote(note.id, {
        related: note.related.filter((r) => linkKey(r.replace(/^\[\[|\]\]$/g, "").split("|")[0]) !== linkKey(c.to)),
      });
    c.status = "removed";
  } else c.status = "rejected";
  c.decided = now();
  saveConnections(list, `${decision} connection ${c.to}`);
  changed(`connection ${c.to}`);
  return c;
}
