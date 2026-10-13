/* The vault: the second brain as plain files.
 *
 *   vault/
 *     AGENTS.md                 how the vault is laid out, for AI agents and people (CLAUDE.md imports it)
 *     INDEX.md                  a generated map: what's here, recent changes, where to look
 *     profile.md                the learner: goals, background, how they like to learn
 *     notes/**.md               notes, in folders if you like; the file name is the title
 *     concepts/<Name>.md        one page per concept, linked to its sources
 *     cards/*.md                flashcards (## Front / ## Back)
 *     figures/*.json            saved figures (scene specs)
 *     attachments/              pictures pasted into notes or captured from books
 *     library/<book>/           one folder per book: book.json, the file, its text by chapter (text/),
 *                               annotations/ (highlights, explanations, figures made from passages),
 *                               a generated README.md
 *     brain/connections.jsonl   links the agent suggested between notes, and what you decided
 *     brain/links.tsv           every link in the vault (generated)
 *     log/*.jsonl               reviews, the learning journey, agent runs
 *
 * Markdown with YAML frontmatter is what agents read best and what people can open in any editor
 * (it is a valid Obsidian vault). The server keeps an index in memory, writes through, notices
 * edits made outside the app, and commits the vault to git a few seconds after changes.
 *
 * This module is the vault's public face; the work happens in the files it re-exports from. */
export { onVaultChange, touched, wroteItself } from "./changes.ts";
export { Collection, GENERATED, trash } from "./collection.ts";
export { annotations, cards, concepts, figures, notes } from "./collections.ts";
export {
  atomicWrite,
  now,
  parseFrontmatter,
  pathId,
  shortId,
  slugify,
  stringifyFrontmatter,
  VAULT,
  vaultRel,
} from "./files.ts";
export { annotationBookInfo, setAnnotationBookInfo } from "./formats.ts";
export { changed, commitNow, git, gitIdentity, hasGit, vaultHistory, vaultIsRepo } from "./git.ts";
export { activity, appendLog, logActivity, logReview, readLog, reviews } from "./logs.ts";
export { DEFAULT_PROFILE, getProfile, saveProfile } from "./profile.ts";
export { initVault, vaultStats } from "./setup.ts";
export { reloadFile } from "./watch.ts";
