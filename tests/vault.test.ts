// The vault's files: documents, frontmatter round trips, logs, the profile and jj.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-"));
process.env.DATA_DIR = dir;

let V: typeof import("../server/vault/index.ts");
let C: typeof import("../server/learn/cards.ts");
beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  C = await import("../server/learn/cards.ts");
  V.initVault();
});

describe("the vault", () => {
  it("round-trips frontmatter", () => {
    const text = V.stringifyFrontmatter(
      { id: "n1", tags: ["a", "b"], source: { bookId: "b1", page: 3 } },
      "# Body\n\nText.",
    );
    const back = V.parseFrontmatter(text);
    expect(back.data).toMatchObject({ id: "n1", tags: ["a", "b"], source: { bookId: "b1", page: 3 } });
    expect(back.body.trim()).toBe("# Body\n\nText.");
  });
  it("writes cards as readable Markdown and reads them back", () => {
    const card = C.saveCard({
      front: "What is replication lag?",
      back: "The delay before a follower reflects a write.",
      deck: "DDIA",
    });
    const text = readFileSync(join(V.vaultDir(), card.path), "utf8");
    expect(text).toMatch(/^kind: card$/m);
    expect(text).toMatch(/## Front\s+What is replication lag\?/);
    expect(card.title).toBe("What is replication lag?");
    V.docs.load();
    expect(V.docs.get(card.id, "card")?.back).toBe("The delay before a follower reflects a write.");
  });
  it("counts a review once, even as the first log entry after a restart", () => {
    const card = C.saveCard({ front: "Q", back: "A", deck: "t" });
    C.rateCard(card.id, 3);
    const state = C.cardState(card.id)!;
    expect(state.reps).toBe(1);
    expect(state.phase).toBe("learning");
    const lines = readFileSync(join(V.vaultDir(), "log", "reviews.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines.filter((l) => l.includes(card.id))).toHaveLength(1);
  });
  it("keeps the learner's profile in profile.md", () => {
    V.saveProfile({ name: "Ada", goals: "Learn distributed systems", styles: { visual: 0.9, reader: 0.2, doer: 0.7 } });
    expect(readFileSync(join(V.vaultDir(), "profile.md"), "utf8")).toMatch(/name: Ada/);
    expect(V.getProfile().styles.visual).toBe(0.9);
  });
  it("explains itself to agents", () => {
    expect(readFileSync(join(V.vaultDir(), "AGENTS.md"), "utf8")).toMatch(/Feynman's Classroom vault/);
  });
});
