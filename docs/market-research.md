# Market research — segmentation, and the decision behind it

Working document for the Week 2 Miro board. The board is a classroom artifact; this file is the
real thing behind it: who we sell to, why they would pay, what kills us, and what we test in the
next four weeks. Figures are dated and sourced; anything marked _(assumption)_ is a number to
replace with data, not a fact.

---

## 1. The decision this document serves

Not "describe the market". Two decisions:

1. **Who is the first paying customer**, given the app itself is GPLv3 and free.
2. **What we charge them for** — because the free app cannot be the product.

Everything below is written to answer those two, and to be wrong in public if it is wrong.

---

## 2. The answer in one page

- The free, local, bring-your-own-subscription app is the **wedge**, not the business. It buys
  credibility with the exact people who distrust SaaS study tools.
- The paying product is a **prepared course, not a copy of the app**: one book turned into
  figures, pretests, quizzes and a tutor bound to its pages, sold per seat to whoever assigns
  that book. The hosted vault and the GPU figure engine are what makes it deliverable.
- **Students are the users, not the buyers.** They choose nothing and pay €60 at most; the buyer
  is the person in front of the room, with a budget and a reason to look good in front of it.
- Do not compete with Gemini Notebook on "explain this passage". Google does it free, in 17M
  people's hands. Compete on **retention and ownership**: what you can still recall in three
  weeks, in files you keep.
- Honest size: this is a **€0.3–1M/yr business** at plausible consumer conversion, not a venture
  case. The per-seat course model is the only version that grows past it.

---

## 3. The market, with real numbers

### 3.1 Direction of travel (use with suspicion)

The global e-learning market is put at **$325B in 2025, growing to $665B by 2031 (CAGR 12.7%)**
(Arizton, Jan 2026). Other houses give $199B or $412B for the same year — a 2× spread on the same
metric. **Lesson for the board: no market-size number in this sector is precise, so never build a
plan on one.** The only thing they agree on is double-digit growth.

### 3.2 Why now — three datapoints, all 2026

| Signal                                    | Number                                                                                                                                                                                                    | What it means for us                                                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chegg collapsed**                       | Q2 2026 revenue **$51.85M, −51% YoY**; academic services **−59 to −61%**; market cap from **$14.7B (2021) to ~$100M (Apr 2026)**                                                                          | The "pay for study help" category did not shrink, it was _replaced_ — by a free general tool. Anyone selling study help now must sell something a chatbot cannot give away.                        |
| **AI use is universal, but shallow**      | **95%** of UK students use AI in at least one way, **94%** for assessed work (HEPI 2026); **85%** of US students used it for coursework in the past year (Inside Higher Ed, 2025–26)                      | The habit is already installed. No education needed; only a reason to switch.                                                                                                                      |
| **They still don't use it to understand** | **42%** use genAI at least weekly, but **84%** seek a _person_ first when stuck on a concept vs **17%** who turn to AI (EDUCAUSE 2025); only **36%** of UK students feel encouraged to use AI (HEPI 2026) | The wide-open gap: AI is used to _produce_, not to _learn_. Everything Feynman's Classroom does — explain it back, find your gaps, schedule recall — sits in the part of the job AI has not taken. |

That third row is the whole product thesis. Read it as: **the market for "AI that does your
homework" is saturated and distrusted; the market for "AI that makes you able to do it" is nearly
empty.**

### 3.3 The competitive set (and what each one takes from us)

| Player                              | Scale / price                                                                                                                                                         | Takes from us                                                                                 | Cannot do                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Gemini Notebook** (ex-NotebookLM) | **17M MAU** (mid-2026); free 50 sources; **$7.99–$20/mo**, Ultra to $200; renamed 16 Jul 2026                                                                         | Source-grounded chat over your PDFs and audio overviews — the "explain my document" job, free | No scheduling, no retention state, no quizzes that persist, no local files, no figures in the margin |
| **ChatGPT + Study Mode**            | Free tier; Study Mode since Jul 2025; ChatGPT for Teens (Aug 2026) bundles quizzes and visualisations; "College Student" plugin generates study guides and flashcards | Socratic questioning, quizzes, flashcard generation — our entire learning loop, free          | No book workspace, no FSRS across sessions, no vault, per-token caps, nothing you own                |
| **Anki**                            | AnkiDroid **10M+ installs**; handed to AnkiHub Feb 2026; FSRS benchmark built on **10k users / 727M reviews**                                                         | Spaced repetition done properly and free — the retention layer                                | No reading surface; card-making is manual, which is exactly what people quit over                    |
| **Quizlet**                         | 60M users claimed; paid tier ~$36/yr                                                                                                                                  | The mass-market habit of flashcards                                                           | Shallow, ad-driven, no depth                                                                         |
| **Obsidian**                        | Free personal; **$50/user/yr** commercial licence; Sync **$4–$8/mo**                                                                                                  | Proof that plain-file users _do_ pay — for sync, not for the editor                           | No learning loop at all                                                                              |
| **RemNote / study-AI clones**       | ~$8–15/mo                                                                                                                                                             | Notes + cards in one place                                                                    | Cloud-only, thin on real textbooks                                                                   |

**Strategic read:** every incumbent owns one half. Google/OpenAI own _explanation_; Anki owns
_retention_; Obsidian owns _ownership_. Nobody owns the seam — a book you read, a margin that
explains, and a scheduler that remembers what you failed to explain. That seam is defensible only
while it is _stateful_: the model vendors can copy a feature in a quarter, they cannot copy a year
of your review history tied to page 214.

### 3.4 Bottom-up size (assumptions, not facts)

| Step                                    | Figure                                      | Source / assumption                         |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Tertiary students, EU-27 + UK + CH + NO | ~20M                                        | UNESCO enrolment data _(verify)_            |
| STEM + medicine share                   | ~25% → **5M**                               | _(assumption)_                              |
| Will run a local app with their own CLI | 2% → **100k**                               | _(assumption — this is the "terminal tax")_ |
| Convert to paid hosted at €60/yr        | 5–10% → **5–10k**                           | _(assumption)_                              |
| **Consumer revenue**                    | **€300k–600k/yr**                           |                                             |
| Lecturer/department licences            | 50 courses × 300 seats × €10/yr = **€150k** | _(assumption)_                              |

Two consequences worth saying out loud:

- **The terminal requirement costs us ~98% of the market.** That is fine for a wedge and fatal for
  a business — hence the hosted tier.
- **This is a small business.** If the course, or the founder, is expecting a venture outcome, the
  segmentation should move to institutions, not students.

---

## 4. The four Miro frames, sharpened

One idea per sticky, 6–10 words, source line underneath. The board has dot voting, so each sticky
must be something the room can point at and say "that's me".

### Geographic (yellow)

| #   | Sticky                                                                      | Evidence                                                                |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | **Nordics + NL + DACH** — DTU, ETH, TUM, TU Delft, KU Leuven                | English-taught, laptop-first, highest willingness to pay in the EU      |
| 2   | **UK & Ireland** — ~2.9M tertiary students                                  | 95% already use AI (HEPI 2026); biggest English market in Europe        |
| 3   | **English-taught STEM in EU-27 as one market**                              | One language, similar curricula, one € price                            |
| 4   | **US & Canada** — ~20M tertiary students                                    | Biggest ARPU, but Chegg's corpse is here — study-help pricing is broken |
| 5   | **India** — ~43M tertiary students                                          | Highest AI adoption; volume and community, not revenue                  |
| 6   | **High-stakes exam systems** — USMLE/MCAT, JEE/UPSC, Staatsexamen, A-levels | Urgency is the only reliable payment trigger                            |
| 7   | **Where Claude Code / Codex billing works** (excl. CN, RU)                  | The no-API-key model is a geographic constraint, not just technical     |
| 8   | **Students already paying $20/mo for AI**                                   | Zero marginal cost; the payment habit exists                            |
| 9   | **EU data-protection buyers** — researchers, clinical-adjacent material     | Local files are a compliance feature, not a preference                  |
| 10  | **English-only at launch**                                                  | German/Danish later — localisation is expansion, not day one            |

### Psychographic (blue)

| #   | Sticky                                     | Evidence                                                                    |
| --- | ------------------------------------------ | --------------------------------------------------------------------------- |
| 1   | **"I want to understand it, not pass it"** | 84% ask a human when stuck — they want comprehension, not output (EDUCAUSE) |
| 2   | **AI-curious, AI-suspicious**              | Daily ChatGPT use, zero trust in a hallucinated answer                      |
| 3   | **Owns their data**                        | Obsidian's $50/yr commercial licence proves this cohort pays                |
| 4   | **Optimisers**                             | Anki's 727M-review benchmark exists because people track retention for fun  |
| 5   | **High-agency self-learners**              | Career switchers reading hard books outside any course                      |
| 6   | **Tinkerers**                              | Has a dotfiles repo; runs `npm install` without flinching                   |
| 7   | **Fears outsourcing their thinking**       | The Feynman step is the antidote, and the pitch                             |
| 8   | **Visual learners drowning in text**       | A figure in the margin beats a paragraph                                    |
| 9   | **Tool-sprawl fatigue**                    | PDF, Obsidian, Anki, Quizlet — four apps for one chapter                    |
| 10  | **Time-poor**                              | 30–60 focused minutes, not a four-hour session                              |

### Behavioural (green)

| #   | Sticky                                                      | Evidence                                                                       |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **The stuck moment**                                        | Dense paragraph → paste into ChatGPT → lose the page. Every ~10 min of reading |
| 2   | **Anki users, 300+ reviews/day**                            | 94% of first-year med students use Anki (Cureus 2025)                          |
| 3   | **Hand-writes "explain it back" notes**                     | The Feynman habit exists before the software does                              |
| 4   | **Exam bursts**                                             | 2–3 weeks of cramming with pretests and quizzes, then silence                  |
| 5   | **Already pays $20/mo**                                     | Bring-your-own subscription is a feature, not a cost                           |
| 6   | **Lossy manual workflow**                                   | Copy → paste → reformat → screenshot the figure → back to the PDF              |
| 7   | **Watches 3Blue1Brown, can't connect it to their textbook** | Intuition without the source                                                   |
| 8   | **Handwritten maths on a tablet, book on the laptop**       | The gap we cannot close yet — say so                                           |
| 9   | **Quit Anki over card-making**                              | Automation is the switch trigger, not features                                 |
| 10  | **Discovers via GitHub, HN, r/Anki, r/medicalschool**       | Not app-store search; no budget for paid acquisition                           |

### Demographic (orange)

| #   | Sticky                                                                 | Evidence                                                        |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | **20–34, tertiary-educated or in it** — STEM, medicine, law, economics |                                                                 |
| 2   | **Medical and life-science students**                                  | Strongest Anki culture that exists; USMLE urgency               |
| 3   | **Physics, maths, engineering students**                               | Benefit most from interactive figures                           |
| 4   | **Master's and PhD researchers**, 10 papers a week                     | The reader plus the vault                                       |
| 5   | **Career switchers into ML/data**, 25–40, $50–120k                     | Self-studying at night, paying for tools                        |
| 6   | **Credential-heavy professionals** — residents, CFA/CPA, lawyers       | Willingness to pay scales with the exam's stakes                |
| 7   | **Already spending $20/mo on AI**                                      | The payment habit is the qualifier                              |
| 8   | **Laptop-first macOS/Windows, 16GB RAM**                               | Comfortable in a terminal — and we must not require it          |
| 9   | **Secondary: lecturers** who want figures and quizzes for their book   | The institutional door                                          |
| 10  | **Non-native English speakers reading English textbooks**              | "Explain this in my language" — a large, quiet majority of STEM |

---

## 5. Pricing architecture

| Tier                    | Price               | What it is                                                      | Anchor that makes it legible                  |
| ----------------------- | ------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| **Free (GPL)**          | €0                  | Self-hosted, bring your own Codex/Claude login                  | Anki, Obsidian personal                       |
| **Classroom Cloud**     | **€8/mo or €60/yr** | Hosted vault, sync, GPU figures, no terminal, no `jj`           | NotebookLM $7.99–20/mo; Obsidian Sync $4–8/mo |
| **Pro**                 | €15/mo              | Multi-vault, version history, priority figures                  | ChatGPT Plus $20/mo                           |
| **Course / department** | **€10–30/seat/yr**  | Shared course vault, lecturer-authored figures and quizzes, SSO | Institutional e-learning per-seat pricing     |

Rules of thumb from the anchors: **€60/yr is the ceiling for a student** (Obsidian's commercial
licence proves it), and **anything above $20/mo must beat ChatGPT Plus on a job ChatGPT cannot do.**

---

## 6. Distribution (no budget)

| Channel                                          | Why it works                                                     | First move                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **GitHub + a `docker compose up` one-liner**     | This segment installs before it reads marketing                  | README as landing page, demo GIF at the top                            |
| **r/Anki, r/medicalschool, r/medicalschoolanki** | 94% Anki penetration in medicine; they share decks and workflows | Show the "passage → cards in one keystroke" clip, not the feature list |
| **Hacker News "Show HN"**                        | Local-first, plain files, no API keys — the house ideology       | One post, honest title, expect the "why not just use ChatGPT" thread   |
| **University societies and study-tool Discords** | Small, high-trust, cheap                                         | 5 societies, not 50                                                    |
| **Lecturers who teach from a book**              | They need figures and quizzes more than students do              | Offer to build one chapter for free, in public                         |

Nothing paid. The segment is reachable by writing, not by buying.

---

## 7. What kills this

1. **Google ships retention.** Gemini Notebook adds scheduled review and per-source quizzes. The
   seam closes, and 17M users get it for free. Mitigation: be the place their _history_ lives, and
   make export lossless.
2. **The terminal tax is real.** Most of the segment will not install Node and jj. If the hosted
   tier slips, the addressable market is hobbyists, and revenue is a donation button.
3. **We sell a feature, not a habit.** "Interactive figures" is a demo; "your 400 cards, scheduled"
   is a product. If retention data does not show week-4 return, the wedge is wrong.
4. **Trust collapse.** One hallucinated figure in a medical context and the segment tells everyone.
   Verification and provenance are the product, not polish.
5. **Wrong unit economics.** If a hosted user costs more in GPU time than €8/mo, the tier must
   meter figures — and metering is what we are positioning against.
6. **Copyright.** Hosting a pack built from a publisher's textbook for paying seats is
   reproduction and communication to the public, not a classroom exception — and a student buying
   their own copy grants no right to redistribute it. Sell packs the course maker owns, or ship
   the derived layer and let students bring their own copy.

---

## 8. Four-week validation, with kill criteria

| Week | Test                                                                                                | Pass                                                      | Kill / pivot                                             |
| ---- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| 1    | 15 interviews: med + STEM students who use Anki _and_ ChatGPT. Screen-share their current workflow. | ≥10 describe the copy-paste-lose-the-page loop unprompted | If they describe no pain, the behavioural frame is wrong |
| 2    | Landing page + waitlist, posted to r/Anki, Show HN, two Discords                                    | **500 emails** from 3 posts                               | <150 → the message, not the channel, is wrong            |
| 3    | 50-person cohort on the hosted build; instrument D1/D7 return, cards created, Feynman submissions   | **D7 ≥ 30%**, ≥5 cards created/user                       | D7 <15% → the loop does not hold; stop building features |
| 4    | Paid intent: €8/mo pre-order or €20 founder licence                                                 | **5% of the waitlist pays or pre-orders**                 | <2% → consumer segment is wrong, pivot to lecturers      |

The one number that decides everything: **paid conversion from the waitlist.** Interest is free;
€8 is the only honest signal.

---

## 9. Recommendation

**Sell prepared courses to the people who already teach them, and let the free local app be the
reason they believe it works.**

### 9.1 Why this and not students

- The consumer ceiling is €60/yr, the terminal requirement removes almost everyone from the
  addressable set, and best case is a few hundred thousand a year. That is a good living and a bad
  reason to keep polishing a desktop app.
- Every feature we have is copyable in a quarter by a lab with a GPU budget. **Prepared material is
  not**: 200 verified figures and quizzes for one specific book is work, not a feature — and it is
  work our own agent already does.
- The code is GPLv3, so code was never the moat. Content, trust, and the switching cost of a
  student's review history are. All three point at courses, not downloads.
- The 84/17 split says people still pay to be _taught_. So sell to the teachers, and let them use
  the engine to teach better.

### 9.2 The thing that is actually sold

> **Course Pack.** Send the book and the syllabus. You get a private vault: every section with an
> interactive figure, a pretest, a post-quiz and a tutor bound to that book, plus a per-student
> seat link, with each student's FSRS history kept for them.
- **€10–20 per seat per semester**, 30-seat minimum.
- **Rights are part of the offer.** The pack may contain the text only when the course maker owns
  it or it is openly licensed. Otherwise the pack ships as the **derived layer** — anchors, figures,
  pretests, quizzes, tutor prompts — and each student brings their own copy of the book to match
  against it.
- The free GPL app stays free and stays the top of the funnel: "this is what your students get, and
  it runs on their own laptop with their own ChatGPT or Claude."
- Marginal cost of the next course is agent time plus your review — the cost curve is model calls,
  not content production. That is the whole model.

### 9.3 The loop: the pack gets better every cohort

Not analytics — a **revision list**. The signal is about the _material_, never about the person:
which paragraph is failing, not which student is slow. That rule is what makes it saleable and safe
at the same time.

What the app already knows, per anchor, without any new tracking:

| Signal                                           | What it says about the material                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Where readers stop                               | The passage they quit on, at paragraph resolution                              |
| Explain / Define / Visualize requests per anchor | The text is not doing its own explaining                                       |
| Follow-up depth                                  | An answer needing two follow-ups did not land                                  |
| **Feynman gaps, clustered**                      | The cohort's missed points are exactly what the chapter failed to teach        |
| Quiz item statistics                             | Difficulty and discrimination per question — a language teachers already trust |
| Figure engagement                                | A figure nobody scrubs is decoration                                           |
| FSRS lapse clusters                              | The concepts that will not stay                                                |

What the course maker gets is one page:

> **Your ten weakest paragraphs, ranked by student evidence.** Then the three figures to replace and
> the four quiz items to rewrite.

Rules that keep it honest:

- Content-scoped, never person-scoped. No student names anywhere, in any export.
- Nothing appears until at least five students have touched an anchor; small cohorts get the
  Feynman-gap map (which works at n=8) and not the item statistics (which need ~30).
- Notes, highlights and the text of a Feynman answer never leave the device. Only counts and rubric
  labels travel.
- Each student can see their own contribution and veto it; deleting a course deletes the digest.
- **Say the awkward part out loud:** a hosted seat means the server holds that student's vault, so
  the "we cannot see your notes" promise applies to the self-hosted path and to what we _do_ with
  the data — not to the fact of hosting. Students who want the strict version run the pack locally.

Why it matters commercially: it sharpens the buyer to **people who teach the same material
repeatedly** — a term course, a cohort bootcamp, a certification prep — because only they can act
on the loop. A one-off lecturer has no reason to buy twice. And it is the one thing in §3.3 that no
incumbent can copy: Google can tell a student what a paragraph means; it cannot tell the author
that the paragraph is bad.

### 9.4 Who to sell to, in order

1. **Small course providers and tutors** — exam prep, private teaching, professional training.
   They already sell teaching, own or license the material, and decide alone.
2. **Lecturers who assign a book** and want it to arrive with figures and quizzes.
3. **Departments and universities** last: procurement, SSO, DPAs and semester-length cycles are
   the wrong shape for a small team, and they will still be there once the first two work.

### 9.5 The first move

In this order, not on a calendar:

1. **One book, one course you can already reach.** Build one chapter as a Course Pack by hand, for
   free. No product work.
2. **Instrument it.** Do students open it a second time? Do they come back after the first week?
   Does the tutor still use it when nobody is watching?
3. **Show the revision list, then ask for money for chapter two.** The list is the proof the pack
   improves; the invoice is the proof it is a product. Not "would you pay" — an invoice.

### 9.6 The gate

If nobody pays for chapter two, the course-provider thesis is wrong. The fallback is the
med-school Anki wedge — 94% Anki penetration, FSRS already built, "import your `.apkg`, get your
cards from the book" — a smaller, cheaper business that needs no sales at all, only a good README
and a subreddit that already cares.

### 9.7 What to stop doing

- Competing with Gemini Notebook on "explain this passage". It is free and it is everywhere.
- Adding product surface before the hosted path exists. The app is already remarkable; it is not
  the bottleneck.
- Chasing US consumers, app stores, or venture money — wrong size, wrong channel, wrong buyer.
- Building a dashboard of people. The buyer wants a list of pages to fix.
- Treating this canvas as the deliverable. The deliverable is one course provider who pays twice.

### 9.8 What would change this

A hosted free-to-try build reaching **D7 ≥ 30%** and **5% of a 500-person waitlist paying €8/mo**
through GitHub and HN alone would make the consumer path real as a small business, worth running in
parallel. Until that number exists, "students will pay" is a hope — and the analysis says the
buyers with budgets are the ones standing in front of a room.

---

## 10. What to paste on the board

Use the four tables in §4 — one row, one sticky. Add a fifth card outside the frames:

> **No revenue model yet: the app is GPLv3 and free. The segment we pick must be the one that pays
> for hosted, or this canvas leads somewhere the project cannot fund.**

And when the dot vote ends, write the sentence that survives:

> A third-year medical student in Copenhagen who already pays for ChatGPT Plus, reads anatomy from
> a PDF, and maintains 400 Anki cards she built by hand.

If the sentence needs an "and" to hold together, it is two segments.

---

## 11. Sources

- Arizton, _Global E-Learning Market 2026–2031_, Jan 2026 — $325B (2025) → $665B (2031), 12.68% CAGR.
- Chegg Q2 2026 results / 10-Q, Aug 2026 — revenue $51.85M, −51% YoY; Financial Express, Apr 2026 —
  $14.7B peak to ~$100M.
- HEPI / Kortext, _Student Generative AI Survey 2026_, Mar 2026 — 95% use, 94% for assessed work,
  36% feel encouraged.
- Inside Higher Ed, _Student Voice 2025–26_ — 85% used AI for coursework.
- EDUCAUSE, _Impact of AI on Learning Assessment_, Jul 2026 — 42% weekly use; 84% ask a person
  first, 17% ask AI.
- Google Workspace Updates, 16 Jul 2026 — NotebookLM renamed Gemini Notebook; MAU and pricing from
  mid-2026 coverage (~17M MAU, $7.99–$200).
- OpenAI, _Study Mode_ (Jul 2025), _ChatGPT for Teens_ (Aug 2026), _College Student_ plugin.
- Anki: AnkiDroid 10M+ installs (Google Play, Oct 2026); founder handover to AnkiHub, Feb 2026;
  FSRS benchmark 10k users / 727M reviews.
- Cureus, 2025 — 94% of first-year medical students use Anki.
- Obsidian pricing, Oct 2026 — free personal, $50/user/yr commercial, Sync $4–8/mo.
- UNESCO tertiary enrolment _(figures to verify against the current release)_.
