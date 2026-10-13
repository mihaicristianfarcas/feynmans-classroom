import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const CHECK = join(ROOT, "server", "generate", "workspace", "check.mjs");
const env = { ...process.env, CLASSROOM_LINKEDOM: join(ROOT, "node_modules", "linkedom", "esm", "index.js") };
const check = (demo: string) => {
  const out = join(mkdtempSync(join(tmpdir(), "classroom-check-")), "report.json");
  const run = spawnSync(process.execPath, [CHECK, "--demo", demo, "--runtime", join(ROOT, "runtime"), "--json", out], {
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  return {
    code: run.status,
    report: JSON.parse(readFileSync(out, "utf8")) as {
      ok: boolean;
      errors: string[];
      warnings: string[];
      stats: Record<string, unknown>;
    },
  };
};
const write = (source: string) => {
  const path = join(mkdtempSync(join(tmpdir(), "classroom-demo-")), "demo.js");
  writeFileSync(path, source);
  return path;
};

describe("the demo check", () => {
  for (const name of ["growing-square", "falling-ball"]) {
    it(`passes the reference demo ${name}`, () => {
      const { code, report } = check(join(ROOT, "runtime", "examples", `${name}.demo.js`));
      expect(report.errors).toEqual([]);
      expect(code).toBe(0);
      expect(report.stats.animates).toBe(true);
    });
  }
  it("fails a demo that throws in its frame", () => {
    const { code, report } = check(
      write(
        `Classroom.demo({ title: "Broken", hint: "h", label: "l", controls: [{ id: "a", min: 0, max: 1, value: 0.5 }], setup(ctx) { ctx.draw(ctx.d2.circle(10, 10, 5)); return { frame(dt, t) { if (t > 1) throw new Error("boom"); } }; } });`,
      ),
    );
    expect(code).toBe(1);
    expect(report.errors.join(" ")).toMatch(/boom/);
  });
  it("fails forbidden APIs", () => {
    const { code, report } = check(
      write(
        `fetch("/x"); Classroom.demo({ title: "Net", hint: "h", label: "l", setup(ctx) { ctx.draw(ctx.d2.circle(5, 10, 5)); return () => true; } });`,
      ),
    );
    expect(code).toBe(1);
    expect(report.errors.join(" ")).toMatch(/fetch/);
  });
  it("fails broken SVG coordinates", () => {
    const { code, report } = check(
      write(
        `Classroom.demo({ title: "NaN", hint: "h", label: "l", setup(ctx) { ctx.draw(ctx.d2.circle(NaN, 10, 5)); return () => true; } });`,
      ),
    );
    expect(code).toBe(1);
    expect(report.errors.join(" ")).toMatch(/broken SVG attribute/);
  });
  it("warns about a static demo, hard-coded colours and inert controls", () => {
    const { code, report } = check(
      write(
        `Classroom.demo({ title: "Still", hint: "h", label: "l", controls: [{ id: "a", min: 0, max: 1, value: 0.5 }], setup(ctx) { ctx.draw('<circle cx="10" cy="10" r="5" fill="#ff0000"/>'); ctx.readout("x"); return () => false; } });`,
      ),
    );
    expect(code).toBe(0);
    const warnings = report.warnings.join(" ");
    expect(warnings).toMatch(/nothing moved/);
    expect(warnings).toMatch(/hard-coded colours/);
    expect(warnings).toMatch(/did not change/);
  });
});
