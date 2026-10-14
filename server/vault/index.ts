/* The vault: the second brain as plain files.
 *
 *   vault/
 *     AGENTS.md                 how the vault is laid out, for AI agents and people (CLAUDE.md imports it)
 *     INDEX.md                  a generated map: what's here, recent changes, where to look
 *     profile.md                the learner: goals, background, how they like to learn
 *     notes/**.md               notes, in folders if you like; the file name is the title
 *     concepts/<Name>.md        one page per concept, linked to its sources
 *     cards/*.md                flashcards (## Front / ## Back)
 *     figures/*.md              figures kept in the brain (a ```figure block)
 *     attachments/              pictures pasted into notes or captured from books
 *     library/<book>/           one folder per book: book.json, the file, its text by chapter (text/),
 *                               annotations/ (highlights, explanations, figures made from passages),
 *                               sessions/ (conversations with the tutor), a generated README.md
 *     brain/connections.jsonl   links the agent suggested between notes, and what you decided
 *     brain/links.tsv           every link in the vault (generated)
 *     log/*.jsonl               reviews, the learning journey, agent runs
 *
 * Every Markdown record is a document of one shape whose `kind` says what it is (docs.ts, kinds.ts);
 * books and logs are the only other things kept. It is a valid Obsidian vault, and what agents read
 * best. The server keeps an index in memory, writes through, notices edits made outside the app, and
 * keeps the vault's history with Jujutsu (jj).
 *
 * This module is the vault's public face; the work happens in the files it re-exports from. */
export { onVaultChange, takeSelfWrite, touched, wroteItself } from "./changes.ts";
export { docs, GENERATED, isGenerated, trash } from "./docs.ts";
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
export {
  changed,
  checkpoint,
  diffOf,
  type FileChange,
  fileAt,
  fileHistory,
  filesOf,
  hasJj,
  jj,
  type Version,
  vaultHistory,
  vaultIsRepo,
} from "./jj.ts";
export { blankDoc, docFromFile, docToFile, sourceFromYaml, sourceToYaml, whereOf } from "./kinds.ts";
export { activity, appendLog, logActivity, logReview, readLog, reviews } from "./logs.ts";
export { DEFAULT_PROFILE, getProfile, saveProfile } from "./profile.ts";
export { initVault, vaultStats } from "./setup.ts";
export { reloadFile } from "./watch.ts";
