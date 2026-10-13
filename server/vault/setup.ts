/* Setting the vault up on startup: its folders, the guide for agents (templates/AGENTS.md, imported
 * by CLAUDE.md), the managed block of its .gitignore, migrations from older layouts, git, and the
 * first load of every collection. */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileNameOf } from "../../shared/links.ts";
import { annotations, COLLECTIONS, cards, concepts, figures, notes } from "./collections.ts";
import { asString, parseFrontmatter, VAULT } from "./files.ts";
import { changed, hasGit, vaultIsRepo } from "./git.ts";
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
  // the first vaults ignored the whole library; books now live there
  mine = mine
    .split("\n")
    .filter((l) => !["library/", "*.tmp", ".DS_Store"].includes(l.trim()))
    .join("\n")
    .trim();
  writeFileSync(path, `${GITIGNORE_START}\n${GITIGNORE.join("\n")}\n${GITIGNORE_END}\n${mine ? `\n${mine}\n` : ""}`);
}

/** Vaults made before books and annotations moved in: generated pages out, readable file names in. */
function migrateV1() {
  const marker = join(VAULT, ".classroom.json");
  const meta = existsSync(marker) ? (JSON.parse(readFileSync(marker, "utf8")) as { version?: number }) : {};
  if ((meta.version || 1) >= 2) return;
  rmSync(join(VAULT, "sources"), { recursive: true, force: true });
  // v1 exported each book's text to library/<slug>-<id>/; books themselves live there now
  if (existsSync(join(VAULT, "library")))
    for (const name of readdirSync(join(VAULT, "library"))) {
      const dir = join(VAULT, "library", name);
      if (statSync(dir).isDirectory() && !existsSync(join(dir, "book.json")))
        rmSync(dir, { recursive: true, force: true });
    }
  // notes and concepts were named by slug; name them by title, as Obsidian does
  for (const dir of ["notes", "concepts"]) {
    const full = join(VAULT, dir);
    if (!existsSync(full)) continue;
    for (const file of readdirSync(full)) {
      if (!file.endsWith(".md")) continue;
      const { data } = parseFrontmatter(readFileSync(join(full, file), "utf8"));
      const title = asString(dir === "notes" ? data.title : data.name);
      if (!title) continue;
      const base = fileNameOf(title);
      let target = `${base}.md`;
      for (let n = 2; existsSync(join(full, target)) && target !== file; n++) target = `${base} ${n}.md`;
      if (target !== file) renameSync(join(full, file), join(full, target));
    }
  }
  writeFileSync(marker, JSON.stringify({ version: 2 }, null, 1));
}

let ready = false;
/** Prepares the vault on startup: folders, migrations, AGENTS.md, .gitignore, git, the indexes in memory, the watcher. */
export function initVault() {
  if (ready) return;
  ready = true;
  for (const dir of DIRS) mkdirSync(join(VAULT, dir), { recursive: true });
  migrateV1();
  copyFileSync(join(TEMPLATES, "AGENTS.md"), join(VAULT, "AGENTS.md"));
  // Claude Code reads CLAUDE.md; Codex reads AGENTS.md
  writeFileSync(join(VAULT, "CLAUDE.md"), "@AGENTS.md\n");
  writeGitignore();
  if (hasGit && !existsSync(join(VAULT, ".git"))) {
    spawnSync("git", ["init", "-q"], { cwd: VAULT });
    changed("vault created");
  }
  for (const c of COLLECTIONS) c.load();
  startWatching();
}

/** Counts for the Settings page. */
export function vaultStats() {
  return {
    notes: notes.items.size,
    concepts: concepts.items.size,
    cards: cards.items.size,
    figures: figures.items.size,
    annotations: annotations.items.size,
    reviews: reviews().length,
    git: vaultIsRepo(),
    path: VAULT,
  };
}
