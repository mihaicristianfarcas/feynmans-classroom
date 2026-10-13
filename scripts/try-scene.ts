// Generates figures for sample passages with the configured provider and reports time and checks.
//   npx tsx scripts/try-scene.ts [name …] [--kind plot|sequence|graph|object3d|auto]
// Results go to DATA_DIR/scenes-dev/<name>.json (the gallery shows them at #/gallery?dev=1).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../server/config.ts";
import { generateScene } from "../server/scene/generate.ts";

const SAMPLES: Record<string, { passage: string; source: { title: string; author: string; chapter: string }; kind?: string; request?: string }> = {
  lag: {
    source: { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", chapter: "5. Replication" },
    passage:
      "If an application reads from an asynchronous follower, it may see outdated information if the follower has fallen behind. This leads to apparent inconsistencies in the database: if you run the same query on the leader and a follower at the same time, you may get different results, because not all writes have been reflected in the follower. This inconsistency is just a temporary state—if you stop writing to the database and wait a while, the followers will eventually catch up and become consistent with the leader. For that reason, this effect is known as eventual consistency. The delay between a write happening on the leader and being reflected on a follower—the replication lag—may be only a fraction of a second. However, if the system is operating near capacity or if there is a problem in the network, the lag can easily increase to several seconds or even minutes.",
  },
  lamport: {
    source: { title: "Distributed Systems", author: "Maarten van Steen & Andrew S. Tanenbaum", chapter: "6. Coordination" },
    passage:
      "Lamport's logical clocks: each process Pi maintains a local counter Ci. Before executing an event, Pi increments Ci. When process Pi sends a message m to process Pj, it sets m's timestamp ts(m) equal to Ci after having executed the previous step. Upon the receipt of a message m, process Pj adjusts its own local counter as Cj ← max{Cj, ts(m)} after which it then executes the first step and delivers the message to the application. With these rules, if a happened before b then C(a) < C(b).",
  },
  pins: {
    source: { title: "The Wealth of Nations", author: "Adam Smith", chapter: "Book I, Chapter 1: Of the Division of Labour" },
    passage:
      "A workman not educated to this business could scarce, perhaps, with his utmost industry, make one pin in a day, and certainly could not make twenty. But in the way in which this business is now carried on, one man draws out the wire, another straights it, a third cuts it, a fourth points it, a fifth grinds it at the top for receiving the head. I have seen a small manufactory of this kind where ten men only were employed. Those ten persons could make among them upwards of forty-eight thousand pins in a day. Each person, therefore, making a tenth part of forty-eight thousand pins, might be considered as making four thousand eight hundred pins in a day.",
  },
  disk: {
    source: { title: "Operating Systems: Three Easy Pieces", author: "Arpaci-Dusseau", chapter: "37. Hard Disk Drives" },
    kind: "object3d",
    passage:
      "A disk has one or more platters; each platter has two surfaces. The platters are bound together around the spindle, which is connected to a motor that spins the platters around at a constant rate. Data is encoded on each surface in concentric circles of sectors; we call one such concentric circle a track. To read and write from the surface, we need a mechanism: the disk head, one per surface. The disk head is attached to a single disk arm, which moves across the surface to position the head over the desired track. The time to read a sector is the seek time, plus the rotational delay, plus the transfer time.",
  },
};

Object.assign(SAMPLES, {
  wick: {
    source: { title: "The Chemical History of a Candle", author: "Michael Faraday", chapter: "Lecture I" },
    passage:
      "It is by what is called capillary attraction that the fuel is conveyed to the part where combustion goes on, and is deposited there, not in a careless way, but very beautifully in the very midst of the centre of action which takes place around it. I have here a substance which is rather porous—a column of salt—and I will pour into the plate at the bottom a saturated solution of salt. You observe that, now I pour in the fluid, it rises and gradually creeps up the salt higher and higher.",
  },
  lens: {
    source: { title: "Feynman Lectures on Physics", author: "Richard Feynman", chapter: "26. Optics: The Principle of Least Time" },
    passage:
      "When light goes from one medium to another it bends. The rule is Snell's law: n1 sin θ1 = n2 sin θ2. Fermat's principle says light takes the path that requires the least time. Like a lifeguard running on sand and then swimming to reach a drowning person, light travels further in the faster medium so as to spend less time in the slower one.",
  },
  lsm: {
    source: { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", chapter: "3. Storage and Retrieval" },
    passage:
      "When a write comes in, add it to an in-memory balanced tree data structure (the memtable). When the memtable gets bigger than some threshold, write it out to disk as an SSTable file. In order to serve a read request, first try to find the key in the memtable, then in the most recent on-disk segment, then in the next-older segment, etc. From time to time, run a merging and compaction process in the background to combine segment files and to discard overwritten or deleted values.",
  },
});

Object.assign(SAMPLES, {
  hashing: { source: { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", chapter: "6. Partitioning" }, passage: "A good hash function takes skewed data and makes it uniformly distributed. Once you have a suitable hash function for keys, you can assign each partition a range of hashes, and every key whose hash falls within a partition's range will be stored in that partition. Consistent hashing places nodes on a ring; each key belongs to the first node clockwise from its hash, so when a node joins or leaves only the keys between it and its neighbour move." },
  raftlog: { source: { title: "Distributed Systems", author: "van Steen & Tanenbaum", chapter: "8. Fault tolerance: Raft" }, passage: "The leader appends the client's command to its log as a new entry, then sends AppendEntries RPCs in parallel to each of the other servers to replicate the entry. When the entry has been safely replicated on a majority of servers, the leader applies the entry to its state machine and returns the result to the client. If followers crash or run slowly, the leader retries AppendEntries indefinitely." },
  osmosis: { source: { title: "Campbell Biology", author: "Urry et al.", chapter: "7. Membrane Structure and Function" }, passage: "Water diffuses across a selectively permeable membrane from the region of lower solute concentration to that of higher solute concentration until the solute concentration on both sides of the membrane is equal. The diffusion of free water across a selectively permeable membrane is called osmosis. Solute molecules that are too large cannot cross the membrane." },
  collisions: { source: { title: "Chemistry: The Central Science", author: "Brown et al.", chapter: "14. Chemical Kinetics" }, passage: "Molecules must collide to react, and only collisions with enough energy, at least the activation energy Ea, lead to reaction. As temperature rises, the fraction of molecules with kinetic energy greater than Ea increases sharply, following the Boltzmann distribution, so the reaction rate increases. Roughly, the rate doubles for every 10 °C rise near room temperature." },
  fourier: { source: { title: "Mathematical Methods", author: "Boas", chapter: "7. Fourier Series" }, passage: "A square wave can be written as an infinite sum of sines: f(x) = (4/π)(sin x + sin 3x / 3 + sin 5x / 5 + ...). Taking more terms makes the partial sum approach the square wave more closely, although near the jumps the partial sums overshoot by about 9 percent — the Gibbs phenomenon — no matter how many terms are taken." },
  marketprice: { source: { title: "The Wealth of Nations", author: "Adam Smith", chapter: "Book I, Chapter 7: Of the Natural and Market Price" }, passage: "The market price of every particular commodity is regulated by the proportion between the quantity which is actually brought to market, and the demand of those who are willing to pay the natural price of it. When the quantity brought to market falls short of the effectual demand, the market price will rise more or less above the natural price. The natural price, therefore, is, as it were, the central price, to which the prices of all commodities are continually gravitating." },
});

const names = process.argv.slice(2).filter((a) => !a.startsWith("--") && SAMPLES[a]);
const kindArg = process.argv.includes("--kind") ? process.argv[process.argv.indexOf("--kind") + 1] : undefined;
const out = join(DATA_DIR, "scenes-dev");
mkdirSync(out, { recursive: true });
await Promise.all(
  (names.length ? names : Object.keys(SAMPLES)).map(async (name) => {
    const s = SAMPLES[name];
    try {
      const r = await generateScene({ passage: s.passage, source: s.source, kind: (kindArg || s.kind || "auto") as never, request: s.request, learner: "A software engineer specialising in distributed systems and agentic infrastructure. Learns by doing: likes to tinker with parameters and break things." });
      writeFileSync(join(out, `${name}.json`), JSON.stringify(r.scene, null, 1));
      console.log(`${name}: ${r.scene.kind} "${r.scene.title}" in ${(r.ms / 1000).toFixed(1)} s, ${r.attempts} attempt(s), ${r.provider}/${r.model}${r.warnings.length ? `\n  warnings: ${r.warnings.join(" | ")}` : ""}`);
    } catch (error) {
      console.log(`${name}: FAILED ${(error as Error).message}`);
    }
  }),
);
