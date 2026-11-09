# Packs and rights: what we can sell about a book we don't own

Checked 9 November 2026. Labels: **[primary]** statute, court summary, licence or the author's
own page; **[secondary]** press or aggregator. **Not legal advice:** a short check with a lawyer
comes before the first paid pack.

## Takeaway

A pack sells *our* work about a book: figures we drew, questions we wrote, a concept graph, and
anchors that find passages in the reader's own copy. It never ships the book's text or pictures.
Copyright doesn't protect ideas, systems or methods, which is what technical books teach, so this
is on firmer ground than companion guides to fiction, two of which lost in court. Still, start
where there is no question at all: **openly licensed systems books**, then partner with authors
for the rest. DDIA's lead author is also a leading advocate of local-first software, which makes
him an unusually natural partner.

---

## 1. What a pack contains, and what it never contains

| In a pack | Never in a pack |
|---|---|
| Concepts with summaries in our own words, and what each builds on | The book's text, beyond what the reader's copy supplies on their machine |
| Figure specs we wrote (sequence, diagram, graph, plot, 3D), checked by a person | The book's own figures, tables or code listings |
| Pretests, quizzes, explain-back prompts and rubrics | Close paraphrase of passages |
| Anchors: chapter, page or position, and a fingerprint of the passage | Quoted passages (today's annotations keep the quote; a pack must not) |
| Edition mapping and errata | |

**Engineering change:** an annotation's `source` stores the quoted passage today
(`server/annotations/anchor.ts`, `server/books/locate.ts`). A pack anchor needs position plus a
short hash of the normalised passage (and of its neighbours), matched against the reader's copy at
open time, with a fallback to page and height when the edition differs.

## 2. The law, briefly

- **Ideas aren't protected.** US copyright does not extend to "any idea, procedure, process,
  system, method of operation, concept, principle, or discovery" [primary,
  [17 U.S.C. § 102(b)](https://www.law.cornell.edu/uscode/text/17/102)]. A figure of how Raft
  elects a leader, drawn by us, explains a method; it doesn't copy the book's expression.
- **Companion works can still infringe** when they take too much expression:
  - *Castle Rock v. Carol Publishing* (2d Cir. 1998): a Seinfeld trivia quiz book was infringing
    and not fair use [primary,
    [Copyright Office summary](https://www.copyright.gov/fair-use/summaries/castlerock-carolpubl’g-2dcir1998.pdf)].
  - *Warner Bros. v. RDR Books* (S.D.N.Y. 2008): the Harry Potter Lexicon, a reference guide,
    was not fair use, largely for its verbatim copying [primary,
    [Copyright Office summary](https://www.copyright.gov/fair-use/summaries/warnerbros-rdrbooks-sdny2008.pdf)].

  Both concern fiction, where the "facts" of the story are themselves the author's expression.
  Technical non-fiction is thinner ground for that argument, but the lesson holds: **no verbatim
  text, no close paraphrase, no copied figures.**
- **The EU has no general fair use;** exceptions are specific, such as quotation for criticism or
  review [primary, [Directive 2001/29/EC, art. 5](https://eur-lex.europa.eu/eli/dir/2001/29/oj)].
  Shipping no text keeps us out of needing one.
- **Authors care.** The Authors Guild objected to Kindle's "Ask this Book" because authors can't
  opt out [primary,
  [Authors Guild](https://authorsguild.org/news/statement-on-amazon-kindle-ask-this-book-ai-feature/)].
  An opt-in, revenue-sharing model is a reason for authors to work with us rather than object.

## 3. Books we can start with

| Book | Licence | Fits our figures | First? | Source |
|---|---|---|---|---|
| *Computer Networks: A Systems Approach* (Peterson, Davie) | **CC BY 4.0** (open-source edition) | Protocol sequences, packets through networks, congestion plots | **Yes: the week-3 pack** | [secondary, citing the book's site](https://freecomputerbooks.com/Computer-Networks-A-Systems-Approach.html); [book site](https://book.systemsapproach.org) |
| *Dive into Deep Learning* (d2l.ai) | **CC BY-SA 4.0** (text) | Plots, model graphs | Yes | [secondary, repository README](https://github.com/d2l-ai/d2l-en) |
| *Structure and Interpretation of Computer Programs*, 2nd ed. | **CC BY-SA 4.0** (MIT Press) | Evaluation graphs, environments | Later | [primary, MIT Press copyright page](https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/full-text/book/book-Z-H-2.html) |
| *Software Engineering at Google* | CC BY-NC-ND 4.0 | Process diagrams | Ask first (non-commercial, no derivatives) | [primary, abseil.io](https://abseil.io/resources/swe-book) |
| Google's *Site Reliability Engineering* | Free online; reported CC BY-NC-ND 4.0 | SLOs, incident flows | Ask first | [primary, sre.google](https://sre.google/workbook/preface/); licence secondary |
| *Operating Systems: Three Easy Pieces* | Free to read; copyright reserved; authors ask readers to link, not copy | Scheduling, memory, concurrency | Permission needed | [secondary](https://news.lavx.hu/article/operating-systems-three-easy-pieces-and-the-quiet-case-for-free-online-books); [site](https://research.cs.wisc.edu/wind/OSTEP) |
| *Distributed Systems*, 4th ed. (van Steen, Tanenbaum) | Free personalised copy; no open licence found | Consensus, replication | Permission needed | [secondary](https://opencourser.com/book/yj051y/distributed-systems) |
| *Designing Data-Intensive Applications*, 2nd ed. | All rights reserved (O'Reilly, 2026) | The ideal book: replication, partitioning, consensus | **Partner** | [primary, O'Reilly](https://www.oreilly.com/library/view/designing-data-intensive/9781098119058/) |

**ShareAlike note:** if a pack for a CC BY-SA book counts as an adaptation, it must carry the
same licence. That suits a funnel: **packs for open books are free and open** (they show what a
pack is and prove the loop), and **paid packs are for partnered books**.

## 4. A partnership model for authors

- **What authors get:** a revenue share on their book's pack [assumption: 30–50%], an opt-in they
  control, a reader who keeps buying *their* book (the pack needs a copy), and evidence of where
  readers stall (anonymous, per paragraph, as the previous research's "revision list").
- **Who first:** Martin Kleppmann, DDIA's lead author, co-wrote the essay that named "local-first
  software" ("you own your data, in spite of the cloud") [primary,
  [Ink & Switch](https://www.inkandswitch.com/local-first/)]. A local-first reader with plain-file
  vaults is aligned with his own work; that's an opening, not a promise.
- **Author-led businesses already exist:** ByteByteGo grew from Alex Xu's books into a newsletter
  with 1.35M+ subscribers and paid courses [primary,
  [ByteByteGo](https://blog.bytebytego.com/p/newsletter-sponsorships-471)]. Authors of interview
  books may welcome a channel that sells their book rather than replacing it.

## 5. What to do

1. Build the anchor format without text (section 1) before any pack ships.
2. Make the first pack for *Computer Networks: A Systems Approach* and release it openly.
3. Write to two authors (DDIA; one interview-book author) with the open pack as the demo.
4. Lawyer's check on the pack format before charging for any pack of a copyrighted book.

## Gaps

- Exact licence texts for d2l (repository LICENSE files) and the SRE book.
- Whether the free *Distributed Systems* copy allows any derived use.
- Typical author royalty rates, to size a revenue share an author would accept.
