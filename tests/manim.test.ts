// Animations (ManimGX): a scene's source tidied into the house shape and read for what can't work
// here, the page it plays in (its policy: its own script, a worker, WebAssembly and the classroom's
// mirror, nothing else), the mirror's guard on what it fetches, and the annotation that keeps it.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "classroom-manim-"));

const { lintScene, normalizeScene, PALETTE } = await import("../server/manim/source.ts");
const { frameCsp, framePage } = await import("../server/manim/frame.ts");
const { createApp } = await import("../server/app.ts");
const { animationBody, animationOf } = await import("../server/annotations/answers.ts");

const SCENE = `import manimgx as m

class Grow(m.Scene):
    def construct(self) -> None:
        self.play(m.Create(m.Circle(color=ACCENT)))
`;

describe("a scene's source", () => {
  it("gets the palette block the player recolours, after the imports", () => {
    const code = normalizeScene(`\`\`\`python\nimport numpy as np\n${SCENE}\`\`\``);
    expect(code.startsWith("import numpy as np\nimport manimgx as m\n\n# the classroom's palette")).toBe(true);
    for (const [name, value] of Object.entries(PALETTE)) expect(code).toContain(`${name} = "${value}"`);
    expect(code).toContain("m.config.background_color = PAPER\n");
    expect(code).toContain("class Grow(m.Scene):");
    // a palette the model wrote its own way is replaced, not doubled
    const again = normalizeScene(code.replace('INK = "#edebe6"', 'INK = "#ffffff"'));
    expect(again.match(/^INK = /gm)).toHaveLength(1);
    expect(again).toContain('INK = "#edebe6"');
    expect(normalizeScene(again)).toBe(again);
  });

  it("keeps a __future__ import first", () => {
    const code = normalizeScene(
      `from __future__ import annotations\n\nclass A(m.Scene):\n    def construct(self): pass\n`,
    );
    expect(code.split("\n").slice(0, 2)).toEqual(["from __future__ import annotations", "import manimgx as m"]);
  });

  it("is read for what can't work here", () => {
    expect(lintScene(normalizeScene(SCENE))).toEqual([]);
    const bad = normalizeScene(`import os
import manimgx as m

class Bad(m.Scene):
    def construct(self):
        open("x.txt")
        self.add_sound("click.wav")
        img = m.ImageMobject("cat.png")
        u = m.Union(m.Circle(), m.Square())
        self.play(m.Write(m.Text("hi", color=m.WHITE)), m.Create(m.Circle(color="#123456")))
`);
    const problems = lintScene(bad).join("\n");
    expect(problems).toMatch(/imports os/);
    expect(problems).toMatch(/open/);
    expect(problems).toMatch(/sound/);
    expect(problems).toMatch(/picture from a file/);
    expect(problems).toMatch(/Union/);
    expect(problems).toMatch(/m\.WHITE/);
    expect(problems).toMatch(/#123456/);
    expect(lintScene("import manimgx as m\nprint(1)\n")).toEqual([expect.stringMatching(/defines no scene/)]);
  });

  it("is kept in its annotation as a ```manim block", () => {
    const code = normalizeScene(SCENE);
    const body = animationBody({ title: "Growing", caption: "Watch it grow.", code });
    expect(body.startsWith("## Growing\n\nWatch it grow.\n\n```manim\nimport manimgx as m\n")).toBe(true);
    expect(`${animationOf({ body } as never)}\n`).toBe(code);
  });
});

describe("the page an animation plays in", () => {
  it("may run its own script, a worker and WebAssembly, and fetch only from the mirror", () => {
    const csp = frameCsp("http://localhost:5173");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: http://localhost:5173/api/manim/");
    expect(csp).toContain("connect-src http://localhost:5173/api/manim/;");
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toMatch(/allow-same-origin|https:|\*/);
  });

  it("is one self-contained page, its worker inside it", async () => {
    const html = await framePage();
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<script type="module">');
    expect(html).toContain("micropip");
    expect(html).not.toMatch(/<script[^>]+src=/);
  }, 30000);

  it("is served with its policy, and the mirror refuses what it doesn't serve", async () => {
    const app = createApp();
    const page = await app.request("http://localhost/api/manim/frame", { headers: { host: "localhost:5173" } });
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("http://localhost:5173/api/manim/");
    const get = (path: string) => app.request(`http://localhost${path}`, { headers: { host: "localhost" } });
    expect((await get("/api/manim/pyodide/..%2F..%2Fsettings.json")).status).toBe(404);
    expect((await get("/api/manim/pypi/requests/json")).status).toBe(404);
    expect((await get("/api/manim/files/packages/aa/bb/not-a-hash/evil.whl")).status).toBe(404);
    const other = await get(`/api/manim/files/packages/aa/bb/${"c".repeat(60)}/requests-2.0-py3-none-any.whl`);
    expect(other.status).toBe(404);
  });
});
