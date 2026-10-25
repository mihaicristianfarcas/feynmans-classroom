/* Connections an agent suggests between notes. It reads the vault with its own shell (the indexes
 * first, then rg and the files it needs) and proposes links worth following, each with a reason.
 * The learner accepts (the link goes into the note's `related` property, so Obsidian and agents see
 * it), rejects, or later removes one; every decision is kept in brain/connections.jsonl, so nothing
 * turned down is suggested again. With the "auto" setting the links are added straight away. What a
 * concept builds on is suggested the same way (builds-on.ts) and decided here, into `builds-on`. */
import { linkKey, parseWikiLinks } from "../../shared/links.ts";
import type { Connection } from "../../shared/vault-types.ts";
import { agent } from "../llm/index.ts";
import { getSettings } from "../settings.ts";
import { listConnections, saveConnections } from "../vault/connections.ts";
import { changed, docs, logActivity, now, shortId, vaultDir } from "../vault/index.ts";
import { writeIndexes } from "../vault/indexes.ts";
import { resolveLink } from "../vault/links.ts";
import { upsertConcept } from "./concepts.ts";
import { learnerSummary } from "./context.ts";
import { updateDoc } from "./docs.ts";

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
  const note = docs.at(path);
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
  if (path && !docs.at(path)) throw new Error("note not found");
  if (!path && !docs.count("note")) return { suggested: [], ms: 0 };
  writeIndexes(); // the agent starts from the indexes: make sure they're current
  const recent = docs
    .list("note")
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
    cwd: vaultDir(),
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
    const note = docs.at(from);
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
      text: `${auto ? "Linked" : "Suggested"} ${added.length} connection${added.length === 1 ? "" : "s"}${path ? ` for ${docs.at(path)?.title}` : ""}`,
    });
  }
  return { suggested: added, ms: result.ms };
}

function addRelated(noteId: string, to: string) {
  const note = docs.get(noteId);
  if (!note) return;
  const link = `[[${to}]]`;
  if (note.related.some((r) => linkKey(r.replace(/^\[\[|\]\]$/g, "")) === linkKey(to))) return;
  updateDoc(noteId, { related: [...note.related, link] });
}

export function decideConnection(id: string, decision: "accept" | "reject" | "remove"): Connection {
  const list = listConnections();
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error("connection not found");
  const note = docs.at(c.from);
  const other = (r: string) => linkKey(r.replace(/^\[\[|\]\]$/g, "").split("|")[0]) !== linkKey(c.to);
  if (decision === "accept") {
    if (!note) throw new Error(c.kind === "builds-on" ? "the concept is gone" : "the note is gone");
    // what a concept builds on goes into its builds-on (out of related, if it was there)
    if (c.kind === "builds-on" && note.kind === "concept") upsertConcept({ name: note.title, buildsOn: [c.to] });
    else addRelated(note.id, c.to);
    c.status = "accepted";
  } else if (decision === "remove") {
    if (note?.kind === "concept" && c.kind === "builds-on")
      updateDoc(note.id, { buildsOn: note.buildsOn.filter(other) });
    else if (note) updateDoc(note.id, { related: note.related.filter(other) });
    c.status = "removed";
  } else c.status = "rejected";
  c.decided = now();
  saveConnections(list, `${decision} connection ${c.to}`);
  changed(`connection ${c.to}`);
  return c;
}
