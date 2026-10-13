// Updates the vendored anatomy skill (vendor/anatomy) from a local copy of it, then rebuilds the kit.
// The app's hand-built demos draw with its kit, and contributors' agents use it as a skill
// (.agents/skills/anatomy links here). Built example pages and the skill's own tests are left out.
//   npm run sync:anatomy -- --from <anatomy skill dir>
// Without --from it looks in ANATOMY_SKILL_DIR, ~/.agents/skills/anatomy and ~/.claude/skills/anatomy.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = join(ROOT, "vendor", "anatomy");

const flag = process.argv.indexOf("--from");
const candidates = [
  flag > 0 ? process.argv[flag + 1] : null,
  process.env.ANATOMY_SKILL_DIR,
  join(homedir(), ".agents", "skills", "anatomy"),
  join(homedir(), ".claude", "skills", "anatomy"),
].filter(Boolean);
const source = candidates.find(
  (dir) => existsSync(join(dir, "SKILL.md")) && existsSync(join(dir, "kit", "iso-kit.mjs")),
);
if (!source) {
  console.error("anatomy skill not found; pass --from <dir> or set ANATOMY_SKILL_DIR");
  process.exit(1);
}

/** What the skill needs at work: its instructions, references, kit, scripts and example sources. */
const keep = (rel) => {
  if (/(^|\/)\.|node_modules/.test(rel)) return false;
  if (/^(tests|evals)\//.test(rel)) return false;
  if (/^(CHANGELOG|CODE_OF_CONDUCT|CONTRIBUTING|SECURITY)\.md$/.test(rel)) return false; // the upstream repo's, not the skill's
  if (/\.test\.mjs$/.test(rel)) return false;
  if (/^examples\/.*\.html$/.test(rel)) return false; // built pages, megabytes each
  return true;
};

rmSync(VENDOR, { recursive: true, force: true });
let files = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(source, full);
    if (!keep(rel)) continue;
    if (statSync(full).isDirectory()) walk(full);
    else {
      mkdirSync(dirname(join(VENDOR, rel)), { recursive: true });
      cpSync(full, join(VENDOR, rel));
      files++;
    }
  }
};
walk(source);
console.log(`synced ${files} files of the anatomy skill from ${source}`);

const kit = spawnSync(process.execPath, [join(ROOT, "scripts", "build-kit.mjs")], { stdio: "inherit" });
process.exit(kit.status ?? 1);
