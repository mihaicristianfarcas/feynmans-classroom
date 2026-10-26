# Market research — segmentation, and the decision behind it

Working document for the Week 2 Miro board. The board is a classroom artifact; this file is the
real thing behind it: who we sell to, why they would pay, what kills us, and what we test in the
next four weeks. Figures are dated and sourced; anything marked _(assumption)_ is a number to
replace with data, not a fact.

**Extended 26 Oct 2026:** the mastery-platform set — Math Academy, ALEKS, Khanmigo, Knewton Alta,
Kumon — is now in §3.5. It revises the price ceiling in §5 and adds a buyer in §9.4.

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
- **Students are the users, not the buyers.** They choose nothing and pay €60 at most; the buyer is
  whoever already pays for the sequence — a parent paying $49/mo for Math Academy or £70/mo for
  Kumon, or the person in front of the room who assigns the book. The lecturer is the cheapest way to
  reach 30–200 of those households at once.
- Do not compete with Gemini Notebook on "explain this passage". Google does it free, in 17M
  people's hands. Compete on **retention and ownership**: what you can still recall in three
  weeks, in files you keep.
- **The nearest competitor is a sequence, not a chatbot.** Math Academy sells a hand-built
  prerequisite graph, a daily quota and scheduled review at **$49/mo, with no free tier**, and says
  it is profitable with no sales team. That is the proof the paid product exists — and the proof it
  cannot be an app alone.
- Honest size: at **€60/yr** this is a **€0.3–1M/yr business**, not a venture case. Math Academy gets
  ~$500/yr from parents, but that price needs a complete sequence and a parent buyer (§3.5); the
  per-seat course is the version that grows past it.

---

## 3. The market, with real numbers

### 3.1 Direction of travel (use with suspicion)

The global e-learning market is put at **$325B in 2025, growing to $665B by 2031 (CAGR 12.7%)**
(Arizton, Jan 2026). Other houses give $199B or $412B for the same year — a 2× spread on the same
metric. **Lesson for the board: no market-size number in this sector is precise, so never build a
plan on one.** The only thing they agree on is double-digit growth.

The adjacent categories have the same disease: "adaptive learning" is **$5.13B (Mordor) or $5.8B
(IMARC) for 2025**, and their forecasts differ by 2.3× by the early 2030s; private tutoring for 2025
is quoted at **$67B, $134B or $240B**. Use these to establish order of magnitude, never to size a
plan.

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

| Player                              | Scale / price                                                                                                                                                         | Takes from us                                                                                              | Cannot do                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Gemini Notebook** (ex-NotebookLM) | **17M MAU** (mid-2026); free 50 sources; **$7.99–$20/mo**, Ultra to $200; renamed 16 Jul 2026                                                                         | Source-grounded chat over your PDFs and audio overviews — the "explain my document" job, free              | No scheduling, no retention state, no quizzes that persist, no local files, no figures in the margin                            |
| **ChatGPT + Study Mode**            | Free tier; Study Mode since Jul 2025; ChatGPT for Teens (Aug 2026) bundles quizzes and visualisations; "College Student" plugin generates study guides and flashcards | Socratic questioning, quizzes, flashcard generation — our entire learning loop, free                       | No book workspace, no FSRS across sessions, no vault, per-token caps, nothing you own                                           |
| **Anki**                            | AnkiDroid **10M+ installs**; handed to AnkiHub Feb 2026; FSRS benchmark built on **10k users / 727M reviews**                                                         | Spaced repetition done properly and free — the retention layer                                             | No reading surface; card-making is manual, which is exactly what people quit over                                               |
| **Quizlet**                         | 60M users claimed; paid tier ~$36/yr                                                                                                                                  | The mass-market habit of flashcards                                                                        | Shallow, ad-driven, no depth                                                                                                    |
| **Obsidian**                        | Free personal; **$50/user/yr** commercial licence; Sync **$4–$8/mo**                                                                                                  | Proof that plain-file users _do_ pay — for sync, not for the editor                                        | No learning loop at all                                                                                                         |
| **RemNote / study-AI clones**       | ~$8–15/mo                                                                                                                                                             | Notes + cards in one place                                                                                 | Cloud-only, thin on real textbooks                                                                                              |
| **Math Academy**                    | **~2,500 hand-built topics**; **$49/mo or ~$500/yr per student**; no trial, no discounts; ~10 school customers                                                        | The prepared sequence, the daily quota and the scheduled review — the nearest paid substitute for our loop | No user-supplied book, no export, no offline, maths only, multiple-choice, no figures; no independent study                     |
| **ALEKS** (McGraw Hill)             | **50M cumulative students** claimed; **$99.95/6 months, $179.95/yr**                                                                                                  | Knowledge-space diagnosis and "learn what you're ready for" — the vocabulary we use                        | Own fixed course, one at a time; "as good, not better" than teaching (Fang 2018); no book you own                               |
| **Khan Academy + Khanmigo**         | Content free; **Khanmigo $4/mo or $44/yr**; teachers free, districts quote-only                                                                                       | Free mastery practice plus a tutor — the price floor for both                                              | No book workspace, no FSRS history, a chat pane not a margin; NBER RCT **+0.06–0.08 SD/yr**, no better than Khan without the AI |
| **Knewton Alta** (Wiley)            | **$49.95/term**, $99.95 two-year pass; 20+ titles                                                                                                                     | The exact shape: adaptive layer on a textbook, instructor adopts, student pays                             | Only Wiley's own titles; no consumer motion; no independent evidence                                                            |
| **Kumon / Mathnasium**              | **$130–220/mo per subject** (Kumon US), £70 (UK), €111 (DE); **$350–579/mo** (Mathnasium)                                                                             | Proof that parents pay monthly, for years, for sequence and routine                                        | 20–85× a €60/yr app; no adaptivity to a book; human delivery                                                                    |

**Strategic read:** every incumbent owns one half. Google/OpenAI own _explanation_; Anki owns
_retention_; Obsidian owns _ownership_. Nobody owns the seam — a book you read, a margin that
explains, and a scheduler that remembers what you failed to explain. That seam is defensible only
while it is _stateful_: the model vendors can copy a feature in a quarter, they cannot copy a year
of your review history tied to page 214.

Two corrections from the mastery-platform set (§3.5). First, someone does own the sequence: Math
Academy has sold a hand-built curriculum with scheduled review since 2021, and Knewton Alta has sold
textbook-plus-adaptive-layer to instructors for longer. What nobody owns is the seam **for a book
the reader already has**. Second, the buyer is more often a parent than a lecturer: Math Academy,
ALEKS, Kumon, Mathnasium and Synthesis all sell to households — software at **$180–500/yr**, human
centres at **$1,000–6,000/yr**. The lecturer is the cheapest route to 30–200 of those households, not
the only person with a budget.

### 3.4 Bottom-up size (assumptions, not facts)

| Step                                    | Figure                                      | Source / assumption                         |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Tertiary students, EU-27 + UK + CH + NO | ~20M                                        | UNESCO enrolment data _(verify)_            |
| STEM + medicine share                   | ~25% → **5M**                               | _(assumption)_                              |
| Will run a local app with their own CLI | 2% → **100k**                               | _(assumption — this is the "terminal tax")_ |
| Convert to paid hosted at €60/yr        | 5–10% → **5–10k**                           | _(assumption)_                              |
| **Consumer revenue**                    | **€300k–600k/yr**                           |                                             |
| Lecturer/department licences            | 50 courses × 300 seats × €10/yr = **€150k** | _(assumption)_                              |

At a mastery-platform price the arithmetic changes: ALEKS is **$179.95/yr**, Math Academy **~$500/yr**,
Kumon **£840/yr**, Mathnasium **$4,200–6,000/yr**. The table above is deliberately the pessimistic,
student-priced version; §3.5 explains why the higher price needs a different buyer and a complete
sequence.

Two consequences worth saying out loud:

- **The terminal requirement costs us ~98% of the market.** That is fine for a wedge and fatal for
  a business — hence the hosted tier.
- **This is a small business.** If the course, or the founder, is expecting a venture outcome, the
  segmentation should move to institutions, not students.

### 3.5 The nearest competitor is a sequence, not a chatbot

The paid substitute for what we do is not Gemini Notebook. It is the mastery platform: a prepared
sequence, a diagnostic, a daily quota and scheduled review, sold to a parent — $4–50/month for
software, $130–580/month for the human version. The closest one, Math Academy, is worth studying
line by line because it is the shape of the business this document argues for — and the clearest
statement of its limits.

| Platform                    | What it sells                                                        | Price (checked Oct 2026)                                                                  | Buyer                           | What it cannot do                                                               |
| --------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| **Math Academy**            | ~2,500 hand-built topics, a prerequisite graph, FIRe scheduling      | **$49/mo** per student; **~$500/yr** annual (reported, not on a live page); no trial      | Parent; adults; ~10 schools     | No book you own, no export, no offline, maths only, multiple-choice, no figures |
| **ALEKS** (McGraw Hill)     | Knowledge-space adaptive courseware, one course at a time            | **$19.95/mo, $99.95/6 mo, $179.95/yr**                                                    | Parent; higher ed               | Own fixed courses; no reader's book; no evidence it beats ordinary teaching     |
| **Khan Academy + Khanmigo** | Free mastery practice; a paid AI tutor on top                        | Content free; **$4/mo or $44/yr**; teachers free; districts quote-only                    | Parent, teacher, district       | No book workspace, no FSRS history; a chat pane, not a margin; US billing       |
| **Knewton Alta** (Wiley)    | Adaptive layer built course-by-course on Wiley textbooks             | **$49.95/term**; $99.95 two-year pass; $14.95/mo                                          | Instructor adopts, student pays | Wiley titles only; no consumer motion                                           |
| **Kumon / Mathnasium**      | Worksheets plus a centre routine; diagnosis and small-group teaching | **$130–220/mo per subject** (Kumon US), £70 (UK), €111 (DE); **$350–579/mo** (Mathnasium) | Parent                          | Human delivery; 20–85× a €60 app; no adaptivity to a book                       |

Beyond those five: **Brilliant** sells interactive puzzles with no long-form reading (~$13–25/mo,
reported); **IXL** is a per-skill drill tree whose best evidence is **+0.08 SD on one 545-student
study** ($9.95/mo); **DreamBox** is K–8 only and rests on a single 2013 K–1 study ($149.95/yr);
**Synthesis** is ages 5–11 with unstable pricing. They compete for practice time, not for the
reading habit, and none of them takes the book the student was assigned.

**Anatomy of the closest one.** Math Academy was started by a husband-and-wife team, is
self-funded, says it is profitable, and has no sales team or paid advertising. It taught local
students from 2013, shipped the software in 2021, and sells one product at one price to parents,
adults and about ten schools. The asset is not a model: it is ~2,500 hand-authored topics, each split
into 3–4 knowledge points, with hand-tuned prerequisite weights — the first graph pass took ~250
expert-hours over ~1,500 topics — and a spaced-review scheme the founder calls **FIRe** (fractional
implicit repetition), where reviewing a high-level skill partly maintains the sub-skills beneath it.
A decade of item-level responses is what makes the fractional credit meaningful. No competitor can
buy that history, and every new customer starts it from zero.

**What it proves, and we should copy.**

- **A prepared sequence is worth $500/yr to a parent.** The price is anchored to a tutor (~$13,000/yr
  in the company's own comparison), not to an app. There is no free tier, no discount, no trial; a
  30-day refund is the trial.
- **The moat is authored structure plus response data, not the model.** A lab can generate 2,500
  topics in a week; it cannot generate the encompassing weights or the item history that makes the
  schedule work. Inference costs fall by a median ~50× a year, so the model is the one input whose
  value keeps falling.
- **A tiny team with no sales team can run this.** By its own account the binding constraints are
  support and school onboarding, not demand. That is the shape of company we can actually operate.
- **Maintenance is part of the product.** AnkiHub's paid pitch is errata and updates; Math Academy's
  is a graph and item bank kept current. A pack that does not visibly maintain itself is a PDF.

**Where it stops — and where we start.**

- **It can only teach its own sequence.** There is no way to bring a book, a syllabus or a paper.
  That is not a missing feature; it is the business model. Our entire product is the same machinery
  over material the reader or the course already has.
- **It optimises throughput, not understanding.** Lessons are an intro, a worked example and 2–5
  multiple-choice questions; explanations are optional; there is no "I don't know". A teacher and a
  long-time learner who reviewed it both say it builds procedural fluency and not much else; one
  calls the prerequisite graph "a lie" because the diagnostic misreads understanding and forces
  remediation. Whatever the fairness of those reviews, the gap they describe — no figures, no
  conceptual back-and-forth, no "why" — is where our margin lives.
- **It has no ownership story.** Cloud-only, no export (users have reportedly written browser
  extensions to get their own data out), no offline mode. A local-first pack can promise the
  opposite without giving up anything.
- **It is maths only, in a US assessment frame.** Its own team has acknowledged the gap: one of them
  would use an LLM to learn biology, because the product does not go there. That sentence is our
  market.
- **Knewton Alta is the commercial proof of the shape.** Adaptive layer on a textbook, instructor
  adopts, student pays $49.95 a term — but only for Wiley's own titles. None of the above has built
  it for books the reader already owns. That is the slot, and it is narrower and more defensible
  than "AI tutor".

**The evidence is smaller than the pitch — say that first.** We found no independent efficacy study
of Math Academy. ALEKS is "as good, but not better" than ordinary teaching across 24 samples. K-12
intelligent-tutoring effects in maths run **g = 0.01–0.09**; the best recent field RCT of an AI tutor
(Khanmigo, 18 schools, two years) is **0.06–0.08 SD/year**; the best single-course result (Kestin,
Harvard physics, N = 194) is 0.63 SD and unreplicated. Bloom's two sigma is a _tutoring_ number — his
own feedback-corrective mastery estimate is 1.0 — and modern human tutoring is d ≈ 0.79, with field
programmes at 0.37. Nor does the prerequisite graph cause learning: prior knowledge predicts rank,
not gain (r = −.059), removing prerequisite gates raises completion, and struggle-first beats
instruction-first (g = 0.36). The graph is a navigator, not a treatment. Spacing and retrieval are
the best-evidenced techniques in the literature, and Anki gives them away — which is why they are
infrastructure, not a price. Math Academy's "4× faster" is arithmetic (XP minutes against allocated
school minutes), not a measured effect, and its 93% lesson pass rate says as much about how the
engine chose the next item as about what the student learned. So: sell coverage, cadence, diagnosis
and the learner's record. Never sell "mastery science" or two sigma; the buyer who checks will
discount everything else you said. A 0.1–0.2 SD product at consumer prices is a good business. A 2.0
SD claim is a credibility risk with exactly the buyer we want.

**What it changes here.**

- **It adds a buyer the doc ignored: the parent.** Math Academy **$500/yr**, Kumon **£840/yr**,
  Mathnasium **$4,200–6,000/yr**, ALEKS **$180/yr**; US parents say they would pay **$357/month** for
  tutoring, and Germany's last national estimate is **€0.94–1.47bn/yr** on Nachhilfe (dated).
  €60/yr is not the top of what a household pays for a sequence; it is the top of what it pays for a
  commodity tool.
- **It does not change the first buyer.** Parents are expensive to acquire and support, they churn
  when the exam ends, and they buy a brand rather than a book. The instructor still brings 30–200
  seats at once. Parent-paid is the second channel, best entered with one high-stakes book
  (A-level, Abitur, AP, USMLE), not with a general app.
- **It raises the bar for what "prepared" means.** A sequence with an end date, a coverage map, a
  diagnostic, a maintained artifact and a completion record are the five things a chatbot cannot
  sell. A "pack" that is a folder of model output is none of them.

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

| #   | Sticky                                     | Evidence                                                                      |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | **"I want to understand it, not pass it"** | 84% ask a human when stuck — they want comprehension, not output (EDUCAUSE)   |
| 2   | **AI-curious, AI-suspicious**              | Daily ChatGPT use, zero trust in a hallucinated answer                        |
| 3   | **Owns their data**                        | Obsidian's $50/yr commercial licence proves this cohort pays                  |
| 4   | **Optimisers**                             | Anki's 727M-review benchmark exists because people track retention for fun    |
| 5   | **High-agency self-learners**              | Career switchers reading hard books outside any course                        |
| 6   | **Tinkerers**                              | Has a dotfiles repo; runs `npm install` without flinching                     |
| 7   | **Fears outsourcing their thinking**       | The Feynman step is the antidote, and the pitch                               |
| 8   | **Visual learners drowning in text**       | A figure in the margin beats a paragraph                                      |
| 9   | **Tool-sprawl fatigue**                    | PDF, Obsidian, Anki, Quizlet — four apps for one chapter                      |
| 10  | **Time-poor**                              | 30–60 focused minutes, not a four-hour session                                |
| 11  | **"I pay for the sequence"**               | Math Academy $49/mo, Kumon £70/mo: the routine is the purchase, not the prose |

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
| 11  | **Keeps a daily quota already**                             | Kumon 30 min/day; Math Academy 20–40 XP/day; Tassomai "Daily Goal"             |

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
| 11  | **Parent of an accelerating or exam-year child**                       | $49/mo Math Academy; $357/mo stated US tutoring WTP (EdChoice)  |

---

## 5. Pricing architecture

| Tier                    | Price                                | What it is                                                      | Anchor that makes it legible                       |
| ----------------------- | ------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------- |
| **Free (GPL)**          | €0                                   | Self-hosted, bring your own Codex/Claude login                  | Anki, Obsidian personal                            |
| **Classroom Cloud**     | **€8/mo or €60/yr**                  | Hosted vault, sync, GPU figures, no terminal, no `jj`           | NotebookLM $7.99–20/mo; Obsidian Sync $4–8/mo      |
| **Pro**                 | €15/mo                               | Multi-vault, version history, priority figures                  | ChatGPT Plus $20/mo                                |
| **Course / department** | **€10–40/seat/yr** (€10–20/semester) | Shared course vault, lecturer-authored figures and quizzes, SSO | Tassomai £5–15/student/yr; Dr Frost £650/school/yr |

**The mastery band is missing from that table.** ALEKS **$99.95/6 mo–$179.95/yr**, Math Academy
**$49/mo–~$500/yr**, AoPS **$465/course**, Up Learn **£429.99 per A-level until the exam**, Kumon
**£840/yr**, Mathnasium **$4,200–6,000/yr**. A €60/yr subscription is the top of the commodity band
(Quizlet $35.99, AnkiHub $55–66), not the top of what a household pays for a sequence. The Course
Pack can charge **€10–20 per seat per semester** and still be a fraction of a tutoring hour per
student; a parent-paid pack for one exam-year book can carry **€150–300 per course**, still below
Up Learn's £430. Price the classroom tier against **Tassomai £5–15/student/yr**, **Dr Frost
£650/school/yr** and **Mathspace $8–23/student/yr**, not against an app. At the volume end,
PhysicsWallah derives about **₹7,959 (~$90) per paid student per year** across 4.9M paid students
and still earns positive EBITDA: a high-stakes market can be enormous or profitable per seat, rarely
both.

**Sell a campaign, not a forever subscription.** Every paid product at the top of this market has an
end date: Up Learn "until summer 2027 exams", Tassomai to the start of the next academic year, Kumon
by monthly notice. AI-native monthly subscriptions retain only **6.1% at 12 months** (RevenueCat
2026). Renewal at the next course is the model; a perpetual "keep your memory fresh" plan fights the
churn curve and loses.

Rules of thumb from the anchors: **€60/yr is the ceiling for a self-serve student tool**, not for a
course; **price the pack against the tutoring hour (£25–60) and the exam-prep course (£180–430), not
against ChatGPT Plus**; and anything above $20/mo must beat ChatGPT Plus on a job ChatGPT cannot do.

---

## 6. Distribution (no budget)

| Channel                                          | Why it works                                                     | First move                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **GitHub + a `docker compose up` one-liner**     | This segment installs before it reads marketing                  | README as landing page, demo GIF at the top                            |
| **r/Anki, r/medicalschool, r/medicalschoolanki** | 94% Anki penetration in medicine; they share decks and workflows | Show the "passage → cards in one keystroke" clip, not the feature list |
| **Hacker News "Show HN"**                        | Local-first, plain files, no API keys — the house ideology       | One post, honest title, expect the "why not just use ChatGPT" thread   |
| **University societies and study-tool Discords** | Small, high-trust, cheap                                         | 5 societies, not 50                                                    |
| **Homeschool and acceleration forums**           | The Math Academy/Kumon buyer: pays $500/yr for a sequence        | One exam-year book, posted with its coverage map                       |
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
   is a product. If retention data does not show week-4 return — and AI-native monthly subscriptions
   retain only **6.1% at 12 months** — the wedge is wrong.
4. **Trust collapse.** One hallucinated figure in a medical context and the segment tells everyone.
   Verification and provenance are the product, not polish.
5. **Wrong unit economics.** If a hosted user costs more in GPU time than €8/mo, the tier must
   meter figures — and metering is what we are positioning against.
6. **Copyright.** Hosting a pack built from a publisher's textbook for paying seats is
   reproduction and communication to the public, not a classroom exception — and a student buying
   their own copy grants no right to redistribute it. Sell packs the course maker owns, or ship
   the derived layer and let students bring their own copy.
7. **The mastery platforms move onto the book.** Math Academy has the graph, the engine, the
   parent's $49 and a decade of item data; "bring your own textbook" is a product decision for them,
   not a research project. Knewton Alta already ships the textbook-plus-layer shape through
   instructors. Mitigation: own the book-specific layer (page anchors, figures, the instructor's
   assessment design) and the ownership promise they cannot make without breaking their cloud model.
8. **The pack is just a model output.** If a competitor can generate a chapter's figures and quizzes
   in an afternoon, the pack is worth nothing; the price has to be carried by verification, errata,
   coverage mapping and the instructor's name. Chegg kept 60–70% gross margins while losing half its
   revenue: cheap to serve is not the same as hard to replace.
9. **We believe our own evidence.** If we repeat "mastery", "two sigma" or "we fix prerequisite
   gaps", a buyer who knows VanLehn or Slavin will stop listening. The defensible claim is
   0.1–0.2 SD, coverage and retention — not 2.0.

---

## 8. Four-week validation, with kill criteria

| Week | Test                                                                                                | Pass                                                      | Kill / pivot                                             |
| ---- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| 1    | 15 interviews: med + STEM students who use Anki _and_ ChatGPT. Screen-share their current workflow. | ≥10 describe the copy-paste-lose-the-page loop unprompted | If they describe no pain, the behavioural frame is wrong |
| 2    | Landing page + waitlist, posted to r/Anki, Show HN, two Discords                                    | **500 emails** from 3 posts                               | <150 → the message, not the channel, is wrong            |
| 3    | 50-person cohort on the hosted build; instrument D1/D7 return, cards created, Feynman submissions   | **D7 ≥ 30%**, ≥5 cards created/user                       | D7 <15% → the loop does not hold; stop building features |
| 4    | Paid intent: €8/mo pre-order or €20 founder licence                                                 | **5% of the waitlist pays or pre-orders**                 | <2% → consumer segment is wrong, pivot to lecturers      |

The one number that decides everything: **paid conversion from the waitlist.** Interest is free;
€8 is the only honest signal. If the parent channel is tested, add five parent interviews to week 1 —
the question is what they already pay for, not whether they like the app — and the paid signal is
**20 pre-orders at €150 for one exam-year book**; zero means the second channel is a hope.

---

## 9. Recommendation

**Sell prepared courses to the people who already teach them, and let the free local app be the
reason they believe it works.**

### 9.1 Why this and not students

- The consumer ceiling is **€60/yr for a self-serve tool** (Math Academy gets $500/yr from parents,
  but only with a complete sequence and a parent buyer), the terminal requirement removes almost
  everyone from the addressable set, and best case is a few hundred thousand a year. That is a good
  living and a bad reason to keep polishing a desktop app.
- **Math Academy is the existence proof and the boundary.** A self-funded tiny company, no
  sales team, no free tier, **$49/month**, ~2,500 hand-built topics and a decade of response data,
  and says it is profitable. It proves a prepared sequence is a product. It also proves the limit:
  it can only teach its own curriculum. Our slot is the same value over a book someone else chose.
- Every **model feature** we have is copyable in a quarter by a lab with a GPU budget; the
  **prepared material** is not — and neither is the response history that makes the schedule good
  (Math Academy's graph took ~250 expert-hours for a first pass, before a decade of item data).
  200 verified figures and quizzes for one specific book is work, not a feature — and it is work our
  own agent already does.
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

**What the buyer is actually paying for.** Five things a chatbot cannot sell, each with a paid
precedent. If the pack does not visibly contain them, it is a folder of model output and will be
priced like Quizlet.

| What                           | Why it is the product                                         | Precedent                                                    |
| ------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------ |
| **Coverage map**               | Every section, page anchor and learning objective, checked    | Up Learn maps to the exam spec; Knewton Alta to the textbook |
| **Sequence, with an end date** | What to do next, and when it is done                          | Math Academy's graph; Kumon's daily worksheet                |
| **Diagnosis**                  | A pretest that says which chapter to skip and which to repair | ALEKS's knowledge space; Mathnasium's assessment             |
| **Maintained artifact**        | Errata, edition changes, new figures — the pack stays correct | AnkiHub's paid pitch                                         |
| **Completion record**          | Proof for the student, the parent or the institution          | Math Academy transcripts; Up Learn's guarantee               |

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
3. **Parents, for one high-stakes book.** They are the most reliable education buyer — $49/mo Math
   Academy, £70/mo Kumon, $357/mo stated US willingness to pay for tutoring — but they are also the
   most expensive to reach, the most demanding to support, and the quickest to leave when the exam
   ends. Sell them a single exam-year pack (A-level, Abitur, AP, USMLE Step 1), not a general app,
   and only after the instructor channel has proved the pack.
4. **Departments and universities** last: procurement, SSO, DPAs and semester-length cycles are
   the wrong shape for a small team, and they will still be there once the first three work.

The order is deliberate: the instructor is a distribution channel as much as a buyer.

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
- Building a 2,500-topic graph, or a daily XP quota. Math Academy already sells that, to a
  different buyer, with a decade of data. Copy its _shape_ — prepared sequence, maintenance,
  record — not its curriculum.
- Adding product surface before the hosted path exists. The app is already remarkable; it is not
  the bottleneck.
- Chasing US consumers, app stores, or venture money — wrong size, wrong channel, wrong buyer.
- Claiming mastery science. The evidence supports 0.1–0.2 SD, not two sigma; the claim costs more
  credibility than it buys.
- Building a dashboard of people. The buyer wants a list of pages to fix.
- Treating this canvas as the deliverable. The deliverable is one course provider who pays twice.

### 9.8 What would change this

A hosted free-to-try build reaching **D7 ≥ 30%** and **5% of a 500-person waitlist paying €8/mo**
through GitHub and HN alone would make the consumer path real as a small business, worth running in
parallel. The other number that would change it: one exam-year book selling **500 parent-paid seats
at €150** without an instructor in the loop. Until either exists, "students will pay" is a hope —
and the analysis says the buyers with budgets are the ones standing in front of a room or paying
the Kumon bill.

---

## 10. What to paste on the board

Use the four tables in §4 — one row, one sticky. Add a fifth card outside the frames:

> **No revenue model yet: the app is GPLv3 and free. The segment we pick must be the one that pays
> for hosted, or this canvas leads somewhere the project cannot fund.**

And a sixth, because the research found it after the board was first drawn:

> **Math Academy already sells the sequence for $49/month. We are not competing with its
> curriculum; we are selling the sequence for the book the course already assigns.**

And when the dot vote ends, write the sentence that survives:

> A third-year medical student in Copenhagen who already pays for ChatGPT Plus, reads anatomy from
> a PDF, and maintains 400 Anki cards she built by hand.

If the sentence needs an "and" to hold together, it is two segments.

If the buyer turns out to be a parent, the sentence is:

> A parent in Munich already pays €111/month for Kumon and $20/month for ChatGPT, and buys the
> Abitur book her daughter's teacher assigned.

Two sentences, two buyers; do not merge them.

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
- **Math Academy:** mathacademy.com (price, FAQ, pedagogy; checked 26 Oct 2026) — $49/mo per
  student, no trial, 30-day refund, no discounts; J. Skycak, "How Math Academy Creates Its
  Knowledge Graph", 13 Nov 2024 — ~2,500 topics, 3–4 knowledge points each, ~250 expert-hours for
  the first full graph pass; J. Skycak, "Math Academy Success Stories", 4 Aug 2026 — 93%/98% lesson
  pass claims, AP anecdotes, the 4× framing; Math Academy Podcast #7 (19 Feb 2026) and #9 (Jun
  2026) — self-funded, profitable, no sales team, ~10 school customers; Pasadena Now (undated) and
  Pasadena Chronicle, "Math Academy, A Decade Later", May 2023 — in-school programme and attrition
  quote.
- **Math Academy reviews:** M. Pershan, "Math Academy Wants To Supercharge Your Learning", 6 Feb
  2025; O. Nova, "A Balanced Review of Math Academy", 10 Apr 2025 ("the DAG is a lie"); dgore,
  "My Review of Math Academy", 12 Jan 2026 (500-day adult review).
- **ALEKS:** aleks.com/about_aleks — 50M cumulative students claimed, 90–95% readiness claims;
  McGraw Hill consumer subscription page, checked 26 Oct 2026 — $19.95/1 mo, $99.95/6 mo,
  $179.95/yr; Fang, Ren, Hu & Graesser 2018, _Educational Psychology_ 39(10):1278–1292 — 15
  studies / 24 samples, "as good, but not better".
- **Khan Academy / Khanmigo:** khanmigo.ai/pricing — $4/mo, $44/yr, free content library, teachers
  free, districts quote-only; Oreopoulos & Low, NBER WP 35620, Aug 2026 — two-year RCT in 18
  Tennessee middle schools, +0.06–0.08 SD/yr, median student used it on a third of practice days.
- **Knewton Alta / Mathspace / Synthesis / AoPS:** Wiley Knewton Alta affordability page, checked
  26 Oct 2026 — $49.95/term, $99.95 two-year pass, $14.95/mo; Mathspace premium — $8/$15/$23 per
  student per year; synthesis.com/pricing — ages 5–11, $29–70/mo; AoPS Online — $465 for Prealgebra
  1, Alcumus free.
- **Other adaptive platforms:** Brilliant — ~$13–25/mo (reported, USD not verified); IXL —
  $9.95/mo, Evidence for ESSA +0.08 from one 545-student study; DreamBox — $149.95/yr, WWC 2013
  snapshot based on 557 K–1 students.
- **Kumon / Mathnasium:** Kumon franchising — 23,700 centres, 3.6M students, 62 countries;
  Tutero/Superprof named-centre prices, Oct 2026 — $130–220 per subject per month; Kumon UK £70,
  Kumon Neuss €111; freefdds 2026 FDD — Mathnasium 1,256 centres, average centre revenue
  $293,590; 1851 Franchise, Jan 2026.
- **Price anchors:** Up Learn pricing — £429.99 until summer 2027 exams, £104.99/mo; Tassomai
  school pricing — £5–15/student/yr; Dr Frost — £650 + VAT per school per year; AnkiHub — $6–10/mo,
  $55–66/yr, AnKing 100k cumulative subscribers (Jan 2025); Quizlet — $35.99/yr; PhysicsWallah FY26
  — ₹3,900 crore revenue, 4.9M paid students, ~₹7,959 derived ARPU; Unacademy sale, Open Magazine,
  Aug 2026; Megastudy FY2025 −6.1%.
- **Churn:** StudyFetch, 5 Jan 2026 — "nearly one in six" users returned for 3+ sessions during
  finals; RevenueCat, _State of Subscription Apps 2026_ — 6.1% 12-month retention on monthly
  AI-app plans; RetentionCheck/ChurnTools — 3.8–7.8% monthly edtech benchmarks (vendor blogs).
- **Evidence:** Bloom 1984 (tutorial 2.0, feedback-corrective 1.0); Kulik, Kulik &
  Bangert-Drowns 1990 (108 evaluations); Slavin 1987 (essentially no effect on standardised
  tests); VanLehn 2011 (human tutoring d = 0.79, ITS 0.76); Nickow, Oreopoulos & Quan 2020 (field
  tutoring 0.37 SD); Steenbergen-Hu & Cooper 2013 (K-12 maths ITS g = 0.01–0.09); Simonsmeier et
  al. 2021 (prior knowledge r = .534, learning gain r = −.059); Sinha & Kapur 2021 (productive
  failure g = 0.36); Kestin et al. 2025 (0.63 SD, N = 194, unreplicated); Bastani et al. 2025
  (unguarded GPT −17% after removal); Wang et al. 2024 (Tutor CoPilot +4 pp, $20/tutor/yr).
- **Spacing and retrieval:** Cepeda et al. 2006; Roediger & Karpicke 2006; Dunlosky et al. 2013;
  Donoghue & Hattie 2021 (mean 0.56 across 169,179 participants).
- **Household spend:** Sutton Trust, _Private Tutoring 2026_ — 29% ever tutored, 45% in London,
  £25–60/hr; Bertelsmann/Klemm — €0.94–1.47bn/yr (dated); EdChoice 2025 — $357/mo stated US
  willingness to pay.
- **Margins and market size:** Duolingo FY2025 revenue $1,038M, 72.2% gross margin; Chegg $377M,
  59.6%, down from $776M in 2021; Coursera $758M, 54.6% (SEC XBRL); Epoch AI — inference price
  decline median ~50×/yr; Mordor/IMARC adaptive learning — $5.13B vs $5.8B for 2025, 2.3× forecast
  spread; private tutoring 2025 quoted at $67B–$240B.
