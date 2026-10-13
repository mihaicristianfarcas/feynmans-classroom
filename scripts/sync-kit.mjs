// Copies the anatomy skill (kit, references, a few examples) into vendor/anatomy and
// bundles the browser kit (window.k, G, T, GL) into runtime/dist/kit.js.
//   node scripts/sync-kit.mjs [--from <anatomy skill dir>]
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

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

if (source) {
  rmSync(VENDOR, { recursive: true, force: true });
  mkdirSync(VENDOR, { recursive: true });
  for (const file of ["SKILL.md", "LICENSE", "README.md"]) cpSync(join(source, file), join(VENDOR, file));
  cpSync(join(source, "references"), join(VENDOR, "references"), { recursive: true });
  mkdirSync(join(VENDOR, "kit"), { recursive: true });
  for (const file of ["iso-kit.mjs", "iso-kit.ts", "lathe.mjs", "tube.mjs", "gl.mjs", "iso.css", "audit.mjs"]) {
    if (existsSync(join(source, "kit", file))) cpSync(join(source, "kit", file), join(VENDOR, "kit", file));
  }
  // Framework-free examples a generator can read and copy patterns from (sources only, no built pages).
  const examples = {
    "dial-indicator": ["build.mjs"],
    "desk-computer": ["build.mjs"],
    "ripple-tank": ["build.mjs", "model.mjs", "live.js"],
    "test-rig": ["rig.ts", "geometry.ts", "art.tsx", "live.tsx"],
  };
  for (const [name, files] of Object.entries(examples)) {
    for (const file of files) {
      const from = join(source, "examples", name, file);
      if (!existsSync(from)) continue;
      mkdirSync(join(VENDOR, "examples", name), { recursive: true });
      cpSync(from, join(VENDOR, "examples", name, file));
    }
  }
  console.log(`synced anatomy skill from ${source}`);
} else if (!existsSync(join(VENDOR, "kit", "iso-kit.mjs"))) {
  console.error("anatomy skill not found; pass --from <dir> or set ANATOMY_SKILL_DIR");
  process.exit(1);
} else {
  console.log("anatomy skill not found locally; keeping vendor/anatomy as is");
}

// Browser bundle: every kit module as a global namespace.
const entry = join(ROOT, "runtime", "dist", "kit-entry.mjs");
mkdirSync(dirname(entry), { recursive: true });
writeFileSync(
  entry,
  `import * as k from "../../vendor/anatomy/kit/iso-kit.mjs";
import * as G from "../../vendor/anatomy/kit/lathe.mjs";
import * as T from "../../vendor/anatomy/kit/tube.mjs";
import * as GL from "../../vendor/anatomy/kit/gl.mjs";
Object.assign(globalThis, { k, G, T, GL });
`,
);
await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  outfile: join(ROOT, "runtime", "dist", "kit.js"),
  legalComments: "none",
});
rmSync(entry);
console.log("wrote runtime/dist/kit.js");
