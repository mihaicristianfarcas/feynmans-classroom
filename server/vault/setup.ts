/* Setting the open vault up (on startup, or when another is opened): its folders, the guide for
 * agents (templates/AGENTS.md, imported by CLAUDE.md), the managed block of its .gitignore (jj reads
 * it too), the jj repository, and the first read of every document. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vaultDir, vaultState } from "./current.ts";
import { docs } from "./docs.ts";
import { changed, jj, requireJj } from "./jj.ts";
import { reviews } from "./logs.ts";
import { startWatching } from "./watch.ts";

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "templates");
const DIRS = ["notes", "concepts", "cards", "figures", "attachments", "library", "brain", "log"];

const GITIGNORE_START = "# --- Feynman's Classroom (managed; your own lines go outside this block) ---";
const GITIGNORE_END = "# --- end ---";
const GITIGNORE = [
  // derived from the books, or generated from the files: rebuilt at startup
  "library/*/source.*",
  "library/*/pages.json",
  "library/*/markdown.json",
  "library/*/blocks.json",
  "library/*/assets/",
  "library/*/text/",
  "library/*/*.jsonl",
  "library/*/demos/*/work/",
  "library/*/demos/*/shots/",
  "library/*/demos/*/*.png",
  "library/*/demos/*/codex.jsonl",
  "/INDEX.md",
  "/notes/INDEX.md",
  "/concepts/INDEX.md",
  "/library/INDEX.md",
  "/library/*/README.md",
  "brain/links.tsv",
  "brain/unresolved.tsv",
  ".trash/",
  "*.tmp",
  ".DS_Store",
  ".obsidian/workspace*.json",
];

function writeGitignore() {
  const path = join(vaultDir(), ".gitignore");
  let mine = existsSync(path) ? readFileSync(path, "utf8") : "";
  const start = mine.indexOf(GITIGNORE_START);
  const end = mine.indexOf(GITIGNORE_END);
  if (start >= 0 && end > start) mine = mine.slice(0, start) + mine.slice(end + GITIGNORE_END.length);
  mine = mine.trim();
  writeFileSync(path, `${GITIGNORE_START}\n${GITIGNORE.join("\n")}\n${GITIGNORE_END}\n${mine ? `\n${mine}\n` : ""}`);
}

const prepared = vaultState(() => ({ ready: false }));
/** Makes a new vault a jj repository (colocated with git, so git tools and Obsidian Git can read it). */
function initRepository() {
  if (existsSync(join(vaultDir(), ".jj"))) return;
  const init = jj(["git", "init"]);
  if (!init.ok) throw new Error(`could not start the vault's jj repository: ${init.stderr}`);
  changed("vault created");
}

/** Prepares the open vault (on startup, or when it is opened): folders, AGENTS.md, .gitignore, jj, the
 * documents in memory, the watcher. Throws when jj isn't installed: the vault needs it. */
export function initVault() {
  const state = prepared();
  if (state.ready) return;
  requireJj();
  state.ready = true;
  for (const dir of DIRS) mkdirSync(join(vaultDir(), dir), { recursive: true });
  copyFileSync(join(TEMPLATES, "AGENTS.md"), join(vaultDir(), "AGENTS.md"));
  // Claude Code reads CLAUDE.md; Codex reads AGENTS.md
  writeFileSync(join(vaultDir(), "CLAUDE.md"), "@AGENTS.md\n");
  writeGitignore();
  initRepository();
  docs.load();
  startWatching();
}

/** Counts for the Settings page. */
export function vaultStats() {
  return {
    notes: docs.count("note"),
    concepts: docs.count("concept"),
    cards: docs.count("card"),
    figures: docs.count("figure"),
    annotations: docs.count("annotation"),
    sessions: docs.count("session"),
    reviews: reviews().length,
    path: vaultDir(),
  };
}
