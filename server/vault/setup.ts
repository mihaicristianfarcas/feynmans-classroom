/* Setting the vault up on startup: its folders, the guide for agents (templates/AGENTS.md, imported
 * by CLAUDE.md), the managed block of its .gitignore (jj reads it too), the jj repository (adopting a
 * git history if there is one), and the first read of every document. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { docs } from "./docs.ts";
import { VAULT } from "./files.ts";
import { changed, hasJj, jj, vaultIsRepo } from "./jj.ts";
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
  const path = join(VAULT, ".gitignore");
  let mine = existsSync(path) ? readFileSync(path, "utf8") : "";
  const start = mine.indexOf(GITIGNORE_START);
  const end = mine.indexOf(GITIGNORE_END);
  if (start >= 0 && end > start) mine = mine.slice(0, start) + mine.slice(end + GITIGNORE_END.length);
  mine = mine.trim();
  writeFileSync(path, `${GITIGNORE_START}\n${GITIGNORE.join("\n")}\n${GITIGNORE_END}\n${mine ? `\n${mine}\n` : ""}`);
}

let ready = false;
/** Makes the vault a jj repository, colocated with git. A vault that was already a git repository keeps
 * its history (jj imports it); the branches agents used under git are dropped, as jj needs none. */
function initRepository() {
  if (!hasJj || existsSync(join(VAULT, ".jj"))) return;
  const hadGit = existsSync(join(VAULT, ".git"));
  const init = jj(["git", "init"]);
  if (!init.ok) {
    console.warn("[vault] could not start a jj repository:", init.stderr);
    return;
  }
  if (hadGit) jj(["bookmark", "delete", "glob:agent/*"]);
  changed(hadGit ? "vault moved to jj" : "vault created");
}

/** Prepares the vault on startup: folders, AGENTS.md, .gitignore, jj, the documents in memory, the watcher. */
export function initVault() {
  if (ready) return;
  ready = true;
  for (const dir of DIRS) mkdirSync(join(VAULT, dir), { recursive: true });
  copyFileSync(join(TEMPLATES, "AGENTS.md"), join(VAULT, "AGENTS.md"));
  // Claude Code reads CLAUDE.md; Codex reads AGENTS.md
  writeFileSync(join(VAULT, "CLAUDE.md"), "@AGENTS.md\n");
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
    versioned: vaultIsRepo(),
    jj: hasJj,
    path: VAULT,
  };
}
