// Bundles the anatomy drawing kit (vendor/anatomy/kit) into runtime/dist/kit.js, the browser
// script hand-built demos load as the globals k, G, T and GL. Runs after `npm install`.
//   node scripts/build-kit.mjs
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(ROOT, "vendor", "anatomy", "kit");

if (!existsSync(join(KIT, "iso-kit.mjs"))) {
  console.error("vendor/anatomy/kit is missing; restore it with: npm run sync:anatomy -- --from <anatomy skill dir>");
  process.exit(1);
}

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
try {
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    minify: true,
    target: "es2020",
    outfile: join(ROOT, "runtime", "dist", "kit.js"),
    legalComments: "none",
  });
} finally {
  rmSync(entry, { force: true });
}
console.log("wrote runtime/dist/kit.js");
