// What a concept builds on: kept as `builds-on` in its file, found when a chapter's concepts are mapped
// (a stand-in model), moved over from `related`, drawn as its own kind of link, carried along by renames,
// and shown as what it builds on and leads to.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makePdf } from "./helpers/pdf.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-builds-on-"));
process.env.DATA_DIR = dir;

// the stand-in model answers with whatever the test sets, and keeps the prompt it was given
let reply: unknown = {};
const prompts: string[] = [];
vi.mock("../server/llm/index.ts", () => ({
  structured: async (options: { prompt: string }) => {
    prompts.push(options.prompt);
    return { data: reply };
  },
  text: async () => {
    throw new Error("no model in tests");
  },
  agent: async () => {
    throw new Error("no model in tests");
  },
  llmLoad: () => 0,
}));

let V: typeof import("../server/vault/index.ts");
let C: typeof import("../server/learn/concepts.ts");
let D: typeof import("../server/learn/docs.ts");
let L: typeof import("../server/vault/links.ts");
let views: typeof import("../server/learn/concept-views.ts");
let graph: typeof import("../server/learn/graph.ts").knowledgeGraph;
let book: import("../server/books/types.ts").Book;

const id = (name: string) => C.findConcept(name)!.id;

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  C = await import("../server/learn/concepts.ts");
  D = await import("../server/learn/docs.ts");
  L = await import("../server/vault/links.ts");
  views = await import("../server/learn/concept-views.ts");
  ({ knowledgeGraph: graph } = await import("../server/learn/graph.ts"));
  const { ingestBook } = await import("../server/ingest/index.ts");
  book = await ingestBook({
    name: "Tiny Probability.pdf",
    data: makePdf([
      ["Probability measures how likely an event is.", "Conditional probability narrows the sample space."],
      ["Bayes' rule turns a likelihood around.", "The posterior is the prior updated by the evidence."],
    ]),
  });
});

describe("what a concept builds on", () => {
  it("is found when a chapter's concepts are mapped, apart from what it's only related to", async () => {
    C.upsertConcept({ name: "Probability", summary: "How likely an event is." });
    reply = {
      concepts: [
        {
          name: "Conditional probability",
          summary: "Probability given that something else happened.",
          quote: "Conditional probability narrows the sample space.",
          builds_on: ["Probability"],
          related: ["Independence", "Probability"],
        },
      ],
    };
    await C.extractConcepts(book.id, book.toc[0].id);
    expect(prompts.at(-1)).toContain("must understand first");
    const cond = C.findConcept("Conditional probability")!;
    expect(cond.buildsOn).toEqual(["[[Probability]]"]);
    // a concept it builds on isn't listed again as related
    expect(cond.related).toEqual(["[[Independence]]"]);
  });

  it("is kept in the concept's file as builds-on, and read back", () => {
    const text = readFileSync(join(V.VAULT, "concepts", "Conditional probability.md"), "utf8");
    expect(text).toMatch(/^builds-on: \["\[\[Probability\]\]"\]$/m);
    expect(V.docs.get(id("Conditional probability"), "concept")!.buildsOn).toEqual(["[[Probability]]"]);
  });

  it("moves over from related when mapping finds it's needed first", () => {
    C.upsertConcept({ name: "Bayes' rule", related: ["Conditional probability", "Probability"] });
    C.upsertConcept({ name: "Bayes' rule", buildsOn: ["Conditional probability"] });
    const bayes = C.findConcept("Bayes' rule")!;
    expect(bayes.buildsOn).toEqual(["[[Conditional probability]]"]);
    expect(bayes.related).toEqual(["[[Probability]]"]);
    C.upsertConcept({ name: "Bayes' rule", buildsOn: ["Conditional probability"] });
    expect(C.findConcept("Bayes' rule")!.buildsOn).toHaveLength(1);
  });

  it("is a link of its own kind, and the concept pages show both ends", () => {
    L.invalidateLinks();
    const edge = L.allEdges().find((e) => e.from === `concept:${id("Bayes' rule")}` && e.kind === "builds-on");
    expect(edge?.to).toBe(`concept:${id("Conditional probability")}`);
    const cond = views.conceptDetail(C.findConcept("Conditional probability")!);
    expect(cond.buildsOn.map((c) => c.title)).toEqual(["Probability"]);
    expect(cond.leadsTo.map((c) => c.title)).toEqual(["Bayes' rule"]);
    // shown as what it builds on or leads to, not also as related
    expect(cond.related.map((c) => c.title)).not.toContain("Probability");
    expect(cond.backlinks.map((c) => c.title)).not.toContain("Bayes' rule");
  });

  it("is drawn once between two concepts, as the stronger link", () => {
    C.upsertConcept({ name: "Probability", related: ["Conditional probability"] });
    L.invalidateLinks();
    const between = graph().edges.filter(
      (e) =>
        [e.from, e.to].sort().join() ===
        [`concept:${id("Probability")}`, `concept:${id("Conditional probability")}`].sort().join(),
    );
    expect(between).toEqual([
      expect.objectContaining({ from: `concept:${id("Conditional probability")}`, kind: "builds-on" }),
    ]);
  });

  it("follows a concept that is renamed", () => {
    D.updateDoc(id("Conditional probability"), { title: "Conditioning" });
    expect(C.findConcept("Bayes' rule")!.buildsOn).toEqual(["[[Conditioning]]"]);
    L.invalidateLinks();
    expect(views.conceptDetail(C.findConcept("Bayes' rule")!).buildsOn.map((c) => c.title)).toEqual(["Conditioning"]);
  });
});
