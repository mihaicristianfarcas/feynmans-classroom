/* The shelf's topics: every book and article is sorted onto one of these (by one quick model call
 * when it arrives, and by hand from the book in the library). Each has a name, the pastel its spines
 * are bound in, a line for the model saying what belongs there, and the order the shelf keeps them
 * in. Used by the server (sorting) and the browser (the bookcase). */

export type Tone = "lavender" | "sage" | "butter" | "peach" | "sky" | "rose";

export interface Topic {
  key: string;
  name: string;
  tone: Tone;
  /** What belongs here, for the model that sorts. */
  hint: string;
}

export const TOPICS = [
  {
    key: "math",
    name: "Mathematics",
    tone: "lavender",
    hint: "mathematics, proofs, calculus, algebra, geometry, statistics as maths",
  },
  {
    key: "physics",
    name: "Physics",
    tone: "sky",
    hint: "physics, astronomy, cosmology, mechanics, relativity, quantum",
  },
  { key: "chemistry", name: "Chemistry", tone: "sage", hint: "chemistry, materials, molecules, reactions" },
  {
    key: "biology",
    name: "Biology",
    tone: "sage",
    hint: "biology, life, evolution, genetics, ecology, the natural world",
  },
  {
    key: "earth",
    name: "Earth & climate",
    tone: "peach",
    hint: "geology, climate, weather, oceans, the environment and the planet",
  },
  {
    key: "medicine",
    name: "Medicine & health",
    tone: "rose",
    hint: "medicine, health, the body, disease, nutrition, sleep",
  },
  {
    key: "mind",
    name: "Mind & psychology",
    tone: "rose",
    hint: "psychology, neuroscience, behaviour, attention, emotion",
  },
  {
    key: "computing",
    name: "Computing",
    tone: "sky",
    hint: "programming, software engineering, computer science, systems, the internet",
  },
  {
    key: "ai",
    name: "AI",
    tone: "lavender",
    hint: "machine learning, language models, neural networks, AI research and its effects",
  },
  {
    key: "engineering",
    name: "Engineering",
    tone: "peach",
    hint: "engineering, hardware, energy, how machines and buildings work",
  },
  { key: "economics", name: "Economics", tone: "butter", hint: "economics, markets, money, finance, policy" },
  {
    key: "business",
    name: "Business & startups",
    tone: "butter",
    hint: "companies, startups, strategy, management, products, work",
  },
  { key: "history", name: "History", tone: "peach", hint: "history, biography, past events and people" },
  {
    key: "society",
    name: "Society & politics",
    tone: "sky",
    hint: "politics, law, society, culture, cities, education policy",
  },
  { key: "philosophy", name: "Philosophy", tone: "lavender", hint: "philosophy, ethics, logic, religion, meaning" },
  {
    key: "learning",
    name: "Learning & thinking",
    tone: "sage",
    hint: "how to learn, study, think, read, remember and do good work",
  },
  {
    key: "writing",
    name: "Writing & literature",
    tone: "rose",
    hint: "fiction, poetry, essays as literature, writing craft, language",
  },
  { key: "design", name: "Art & design", tone: "peach", hint: "art, design, architecture, music, typography, craft" },
  { key: "other", name: "Other", tone: "butter", hint: "anything that fits none of the others" },
] as const satisfies readonly Topic[];

export type TopicKey = (typeof TOPICS)[number]["key"];

export const TOPIC_KEYS = TOPICS.map((t) => t.key) as TopicKey[];

const BY_KEY = new Map<string, Topic>(TOPICS.map((t) => [t.key, t]));

/** A topic by its key; anything unknown (or not sorted yet) is "Other". */
export const topicOf = (key: string | undefined): Topic => BY_KEY.get(key || "") || BY_KEY.get("other")!;

export const isTopic = (key: unknown): key is TopicKey => typeof key === "string" && BY_KEY.has(key);

/** Where a topic stands on the shelf (the order of TOPICS). */
export const topicOrder = (key: string | undefined) => {
  const i = TOPICS.findIndex((t) => t.key === key);
  return i < 0 ? TOPICS.length : i;
};

/** Tags as the shelf keeps them: up to three short lowercase words or phrases, never the topic's own name. */
export function cleanTags(tags: unknown, topic: string): string[] {
  if (!Array.isArray(tags)) return [];
  const name = topicOf(topic).name.toLowerCase();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw
      .toLowerCase()
      .replace(/[^\p{L}\p{N} &+.'-]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!tag || tag.length > 32 || tag === name || tag === topic || out.includes(tag)) continue;
    out.push(tag);
    if (out.length === 3) break;
  }
  return out;
}
