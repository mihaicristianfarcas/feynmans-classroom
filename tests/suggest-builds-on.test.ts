// What concepts build on, proposed by a stand-in model for the concepts that don't say: only real,
// new, non-circular links for concepts without builds-on; suggestions decided like other links
// (accepted into builds-on and out of related, turned down, removed), and listed even between related
// concepts; a concept asked about once isn't asked again; the "auto" setting writes them straight away.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-suggest-builds-on-"));
process.env.DATA_DIR = dir;

// the stand-in model answers with whatever the test sets, and keeps the prompt it was given
let reply: unknown = {};
const prompts: string[] = [];
vi.mock("../server/llm/index.ts", () => ({
  structured: async (options: { prompt: string }) => {
    prompts.push(options.prompt);
    return { data: reply, provider: "codex", model: "stand-in" };
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
let B: typeof import("../server/learn/builds-on.ts");
let decide: typeof import("../server/learn/connections.ts").decideConnection;
let graph: typeof import("../server/learn/graph.ts").knowledgeGraph;
let saveSettings: typeof import("../server/settings.ts").saveSettings;

const concept = (name: string) => C.findConcept(name)!;
const link = (from: string, to: string, why = "It uses it.") => ({ concept: from, buildsOn: to, why });
const toPlace = (prompt: string) => prompt.slice(prompt.indexOf("<to-place>"), prompt.indexOf("</to-place>"));

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  C = await import("../server/learn/concepts.ts");
  B = await import("../server/learn/builds-on.ts");
  ({ decideConnection: decide } = await import("../server/learn/connections.ts"));
  ({ knowledgeGraph: graph } = await import("../server/learn/graph.ts"));
  ({ saveSettings } = await import("../server/settings.ts"));
  C.upsertConcept({ name: "Probability", summary: "How likely an event is, from 0 to 1." });
  C.upsertConcept({
    name: "Conditional probability",
    summary: "Probability given that something happened.",
    related: ["Probability"],
  });
  C.upsertConcept({
    name: "Bayes' rule",
    summary: "Turning P(B|A) into P(A|B).",
    buildsOn: ["Conditional probability"],
  });
  C.upsertConcept({ name: "Random variable", summary: "A number decided by chance." });
  C.upsertConcept({ name: "Expected value", summary: "The long-run average of a random variable." });
});

describe("what concepts build on, proposed", () => {
  it("only for concepts without builds-on, and only real, new links that don't go in a circle", async () => {
    reply = {
      links: [
        link("Conditional probability", "Probability", "It is a probability, restricted to what happened."),
        link("Expected value", "Random variable"),
        link("Expected value", "Probability"),
        link("Probability", "Probability"), // itself
        link("Bayes' rule", "Probability"), // it has builds-on already
        link("Probability", "Conditional probability"), // the other way round from one just proposed
        link("Random variable", "Martingale"), // no such concept
        link("Conditional probability", "Bayes' rule"), // Bayes' rule builds on it
      ],
    };
    const { suggested } = await B.suggestBuildsOn();
    expect(suggested.map((c) => `${c.from} → ${c.to}`)).toEqual([
      `${concept("Conditional probability").path} → Probability`,
      `${concept("Expected value").path} → Random variable`,
      `${concept("Expected value").path} → Probability`,
    ]);
    expect(suggested.every((c) => c.kind === "builds-on" && c.status === "suggested")).toBe(true);
    const prompt = prompts.at(-1)!;
    expect(prompt).toContain("- Random variable: A number decided by chance.");
    expect(prompt).toContain("- Bayes' rule: Turning P(B|A) into P(A|B).");
    expect(toPlace(prompt)).not.toContain("Bayes' rule");
    expect(concept("Conditional probability").buildsOn).toEqual([]);
  });

  it("are drawn as suggestions that say so, even between concepts already related", () => {
    const edges = graph().edges;
    const between = (a: string, b: string) =>
      edges.filter(
        (e) => [e.from, e.to].sort().join() === [`concept:${concept(a).id}`, `concept:${concept(b).id}`].sort().join(),
      );
    expect(between("Expected value", "Random variable")).toMatchObject([{ kind: "suggested", suggests: "builds-on" }]);
    // the related link between them gives way to the suggestion, so it can be decided
    expect(between("Conditional probability", "Probability")).toMatchObject([
      { kind: "suggested", suggests: "builds-on" },
    ]);
  });

  it("are decided like any link: accepted into builds-on (out of related), turned down, removed", () => {
    const pending = graph().edges.filter((e) => e.kind === "suggested");
    const id = (from: string, to: string) =>
      pending.find((e) => e.from === `concept:${concept(from).id}` && e.to === `concept:${concept(to).id}`)!.id!;
    const accepted = id("Conditional probability", "Probability");
    decide(accepted, "accept");
    expect(concept("Conditional probability").buildsOn).toEqual(["[[Probability]]"]);
    expect(concept("Conditional probability").related).toEqual([]);
    const drawn = graph().edges.find(
      (e) =>
        e.from === `concept:${concept("Conditional probability").id}` &&
        e.to === `concept:${concept("Probability").id}`,
    );
    expect(drawn?.kind).toBe("builds-on");
    decide(id("Expected value", "Probability"), "reject");
    expect(concept("Expected value").buildsOn).toEqual([]);
    decide(accepted, "remove");
    expect(concept("Conditional probability").buildsOn).toEqual([]);
  });

  it("aren't asked for again for a concept already asked about", async () => {
    reply = { links: [] };
    expect((await B.suggestBuildsOn()).suggested).toEqual([]);
    const placing = toPlace(prompts.at(-1)!);
    expect(placing).toContain("- Probability");
    expect(placing).toContain("- Random variable");
    expect(placing).not.toContain("Conditional probability");
    expect(placing).not.toContain("Expected value");
  });

  it("are written straight away with the auto setting", async () => {
    saveSettings({ connections: "auto" });
    C.upsertConcept({ name: "Variance", summary: "How far a random variable spreads around its mean." });
    reply = { links: [link("Variance", "Expected value")] };
    const { suggested } = await B.suggestBuildsOn();
    expect(suggested).toMatchObject([{ status: "accepted", to: "Expected value" }]);
    expect(concept("Variance").buildsOn).toEqual(["[[Expected value]]"]);
    saveSettings({ connections: "suggest" });
  });
});
