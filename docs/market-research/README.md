# Market research: engineers learning hard technical material

Research run of **9 November 2026**, for the Digital Economics product (idea → market research →
competitive research). It replaces the Course Pack research (lecturers and course providers as
the first buyer), which stays in this branch's history at commit `081b7e7`. The proposal it tests
is [issue #45](https://github.com/mihaicristianfarcas/feynmans-classroom/issues/45).

**Update, 23 November 2026: the direction is decided.** The app stays general, a second brain for
learning, and engineers are the first group we sell to and test with. A teacher and mentor view
comes second, and paid, self-hosted plans for institutions third. The order and the reasons are in
[direction.md](direction.md); the five forces for the Miro board are in
[five-forces.md](five-forces.md). Sections 1, 3, 8 and 12 below are updated to match.

This page is the decision and the argument. The evidence is in five notes beside it, and two newer
notes build on them:

| Note | What it answers |
|---|---|
| [demand.md](demand.md) | Who the customer is, how many there are, and why now |
| [competitors.md](competitors.md) | Who else they could pay, at what price, and what each can't do |
| [model-access.md](model-access.md) | Whether the "your own AI plan" model is allowed, and what it does to costs |
| [packs-and-rights.md](packs-and-rights.md) | What a prepared book pack can contain without breaking copyright |
| [sizing-and-pricing.md](sizing-and-pricing.md) | Market size, comparable businesses, prices to test |
| [direction.md](direction.md) | Who it's for and in what order: engineers, then teachers and mentors, then institutions (23 November) |
| [five-forces.md](five-forces.md) | Porter's five forces for the Miro board, each factor with its source (23 November) |

**How to read the sources.** Every number carries a label: **[primary]** is the vendor's, author's
or court's own page, a filing or a paper; **[secondary]** is press, an aggregator or a review site;
**[assumption]** is our own number, to replace with data. Vendor pages were read on 9 November
2026. Where sources disagree, the note says so.

---

## 1. The answer in one page

- **The first paying customer is a working software engineer** who has to understand a hard
  technical book for a deadline: a system-design interview, a promotion case, or a move into a new
  field. The app itself stays general (a second brain for learning, free for anyone); students
  and their teachers come second, through a shared teacher view, and institutions third
  ([direction.md](direction.md)).
- **The product is the loop we already have, aimed at their books:** read *Designing
  Data-Intensive Applications* (DDIA) or *Computer Networks: A Systems Approach* with a margin, see
  the protocol or the replication scheme as a figure you can scrub, explain it back and get your
  gaps, and have the ideas scheduled so they're still there on interview day.
- **It runs on the AI plan they already pay for.** Engineers already have Codex or Claude Code
  installed and logged in, so the terminal requirement costs us almost nothing with them. Since
  DevDay 2026, OpenAI also documents a self-serve way for open-source local apps to use a ChatGPT
  plan, so the CLI isn't even needed for Plus and Pro users. We pay for no model calls.
- **We sell what a chatbot gives away last: prepared packs and continuity.** A pack per standard
  book (checked figures, a concept graph, question banks, no book text), sync, and review on a
  phone. Priced as a campaign or a one-off per book, because the market already sells that way
  (lifetime and yearly plans dominate interview prep) and because AI subscriptions churn fast.
- **The honest size is a small business first:** about €0.05–0.5M a year after two years
  [assumption], with comparable bootstrapped businesses at $1–6M. A team tier for onboarding,
  paid from learning budgets, is the path past that.
- **Two things must change in the app:** a "Sign in with ChatGPT" path (and not building the
  business on Claude plans, which Anthropic's terms forbid third-party apps to route requests
  through), and packs whose anchors carry no book text.

---

## 2. What changed from the previous research, and what didn't

The Course Pack research was careful, and most of its lessons still hold. What changed is the
customer, for four reasons it surfaced itself:

| Course Pack (lecturers, students) | Engineers |
|---|---|
| Needing a terminal and a CLI login cost ~98% of students [assumption, previous research] | Engineers already run Codex or Claude Code daily |
| Students rarely pay for an AI plan, so a hosted tier must pay for model calls | 65.9% of developers use AI coding assistants or agents [secondary]; the plan is already paid |
| We would produce content per course: a service business | Packs per *standard book* are made once and sold many times |
| Slow buyers: a semester, procurement | Self-serve buyers; employers' learning budgets later |

**Kept from the previous research:** sell campaigns with an end date, not open-ended
subscriptions; never claim "two sigma" or "mastery"; compete on retention and ownership, not on
"explain this passage"; ship packs as a derived layer while the reader brings their own copy; keep
the AGPL.

---

## 3. The customer

> *A backend engineer, already paying for ChatGPT Plus, six weeks from a system-design interview,
> stuck on chapter 5 of DDIA.*

**The job:** understand a dense systems book well enough to *explain and defend* its ideas out
loud (replication, partitioning, consensus, congestion control, caching, queues), by a date.

**Three triggers, each with a deadline:**

1. **A system-design interview.** Vendors say design rounds are "almost always" in mid and senior
   loops [secondary, vendor claim; no independent share found]. Interviews are moving back in
   person: Gartner is cited as finding 72.4% of recruiting leaders running in-person interviews to
   fight AI fraud [secondary], and Google, Cisco and McKinsey were reported doing so in 2025
   [secondary].
2. **A promotion case or a new senior role.** Of the rise in US software postings from May 2025 to
   May 2026, 71% was for senior roles [secondary, citing Indeed Hiring Lab].
3. **A move into a new field** (distributed systems, ML infrastructure, networking).

**Who we don't sell to first:** students and juniors (they mostly lack a paid plan and budgets),
non-engineers (no CLI, and plan usage in apps covers ChatGPT Plus and Pro only), and companies.
They are welcome in the free app. Students come back in step two, through a teacher who reviews
what they choose to share; companies and universities in step three, as buyers of a self-hosted
server ([direction.md](direction.md)).

Details and sources: [demand.md](demand.md).

---

## 4. Why now: five 2026 datapoints

| Signal | Number | What it means for us |
|---|---|---|
| **AI can stop engineers learning** | In Anthropic's January 2026 trial, engineers learning a new library with AI scored **50%** on a quiz against **67%** without it; those who used AI to ask for explanations kept their learning [primary] | The pitch: AI used to *understand*, not to delegate. The app's loop is the second kind by design |
| **Trust needs sources** | 48% of developers trust AI output only when they can easily verify it; 93% say source attribution matters [secondary, Stack Overflow 2026] | Answers anchored to the exact passage are a trust feature, not a nicety |
| **Senior hiring is back, and interviews are in person again** | US software postings up ~15% since Feb 2025, still 27.5% below pre-pandemic [secondary, Indeed]; 72.4% of recruiting leaders run in-person interviews [secondary, Gartner] | Understanding you can show without an assistant is worth paying for again |
| **The canonical book is new again** | DDIA's second edition came out in early 2026 (O'Reilly lists February) [primary] | A whole cohort is rereading the most-recommended system-design book |
| **Plans can be used in other apps** | OpenAI documents self-serve plan usage for open-source local apps; paid apps apply [primary] | No terminal for Plus and Pro users, and still no model costs for us |

Junior employment is the other side of this: Stanford's Digital Economy Lab found the youngest
software developers' employment about 20% below its late-2022 peak by mid-2025 [secondary,
summarising the paper]. That is a reason to start with mid-level and senior engineers.

---

## 5. Competition

Five groups compete for the same hours and money. Full detail, prices and sources:
[competitors.md](competitors.md).

| Group | Examples (price, checked 9 Nov 2026) | What they take from us | What they can't do |
|---|---|---|---|
| **Interview prep** | Hello Interview ($47/month, $89/year, $299 lifetime) [primary]; DesignGurus ($373/year) [primary]; NeetCode Pro ($119/year) [primary]; Aced, formerly Exponent ($79/month or $149/year) [secondary]; LeetCode Premium ($159/year) [secondary]; ByteByteGo (1.35M+ newsletter subscribers) [primary] | The deadline money, the brand, question banks, AI mock interviewers | Work on the book you're reading; schedule what you'd forget; show *your* gaps in *your* explanation |
| **Technical libraries** | O'Reilly ($499/year, "O'Reilly Answers") [secondary]; Manning ($199.99/year, liveBook AI) [secondary]; Educative (AI mocks, AI tutor) [primary] | The books themselves, with AI inside | Books from other publishers; figures you can play with; retention; files you own |
| **Free AI tutors** | Gemini Notebook (flashcards, quizzes, mastery tracking) [secondary]; ChatGPT Study Mode (free) [secondary]; Claude Code's Learning output style [primary]; Kindle "Ask this Book" [secondary] | "Explain this passage", free, everywhere | A schedule kept across months; figures of systems; explain-back graded against the source; your data outside their cloud |
| **Spaced repetition and courses** | Anki (free); RemNote (Pro with AI $18/month) [secondary]; Execute Program ($39/month) [secondary]; Boot.dev ($399/year) [secondary] | Retention done properly; courses with review built in | Any book you bring (Execute Program and Boot.dev teach their own courses); card-making without manual work (Anki) |
| **Onboarding and context tools** (team tier, later) | Unblocked, Glean, Swimm, DeepWiki [secondary] | Company knowledge for new hires and their agents | Understanding kept by the person; only DeepWiki is free, and only for public code |

**Where we sit.** Two questions separate everyone: *whose material is it* (theirs, or the book
you already own), and *what do you leave with* (an answer, or understanding you keep).

| | **You leave with an answer or a template** | **You leave with understanding you keep** |
|---|---|---|
| **Their material** | Interview prep, O'Reilly, Manning, Educative | Execute Program, Boot.dev (their courses, review built in) |
| **Your material** | Gemini Notebook, ChatGPT, Kindle Ask this Book | Anki and RemNote (manual), **us** (figures, explain-back, schedule, automatic) |

The empty-looking cell isn't empty: Anki and RemNote are there, but card-making is manual and
neither draws the system you're reading about. That is the slot.

**The positioning sentence.** *For engineers who have to really understand a hard technical book,
by a date, [the product] is a reader that draws the systems you read about, makes you explain them
back, and schedules what you'd otherwise forget. Unlike interview-prep courses, it works on the
book you already own; unlike ChatGPT or Gemini, it keeps what you understood, in your own files,
on the AI plan you already pay for.*

---

## 6. What is defensible, and what isn't

**Not defensible on its own:** explaining a passage (free everywhere), making flashcards (Gemini
Notebook does it, editable since June 2026 [secondary]), an AI mock interviewer (Hello Interview,
Educative and DesignGurus all have one [primary]), and the code (AGPL; anyone can read it).

**Defensible, in rising order:**

1. **The combination on one page:** figures of systems (sequence diagrams of protocols, packets
   moving through a network, replication graphs), explain-back graded against the source passage,
   and a schedule. Each exists somewhere; together, on the book you own, nowhere we found.
2. **Prepared packs:** checked figures and question banks per standard book. Work, not a feature,
   and it compounds: every cohort's misses show which figure or question to fix.
3. **The learner's history:** months of reviews tied to page anchors, in files they own. Low
   lock-in by design (plain files), so it earns loyalty rather than trapping it.
4. **Zero inference cost:** we run no models, so we can price below anyone who does. AI products
   average about 52% gross margin against SaaS roughly 25–30 points higher [secondary, ICONIQ];
   we keep a software margin as long as we don't host models.

---

## 7. Model access: the precondition

Details and quotes: [model-access.md](model-access.md).

- **OpenAI wants apps like ours.** Its "Sign in with ChatGPT" docs explain plan usage "for
  open-source and locally hosted apps"; open-source apps register themselves with no client
  secret and no partner key; a paid or remotely hosted app completes an interest form [primary].
  Launch partners include OpenCode, which this app already supports [secondary].
- **Anthropic doesn't.** Claude Code's legal page: "Anthropic does not permit third-party
  developers to offer Claude.ai login into their own applications", nor to "route requests
  through Free, Pro, Max, or Ultra plan credentials on behalf of their users" [primary]. A user
  signing in to the unmodified `claude` binary is allowed; an app driving it on their behalf is at
  best a grey zone for a paid product.
- **Google's Gemini CLI** gives a personal Google account about 1,000 requests a day free
  [secondary, citing the quota page]: a possible free path for people without a paid plan.

**Decision this forces:** make Sign in with ChatGPT the default, keep the CLIs for power users,
don't make revenue depend on Claude plans, and decide whether "No API keys, ever" becomes "no keys
needed" (keys or a local model as an optional fallback). Platforms change terms: Reddit's 2023 API
pricing shut down Apollo and other third-party clients [secondary].

---

## 8. The product and the prices to test

| Tier | What it is | Price hypothesis |
|---|---|---|
| **Free** | The AGPL app: local, on the user's own plan | €0 |
| **Book pack** | One standard book's checked figures, concept graph and question banks; no book text; updates for that book's edition | **A:** €19 one-off per book |
| **Campaign** | All packs, sync, phone review, "explain the design" sessions, for a fixed period | **B:** €39 for three months |
| **Teacher and mentor view** (step two) | A learner shares a view of how they understand (explain-backs, gaps, concept map, progress) with a teacher or mentor; adults first | To learn in a four-week pilot |
| **Institution** (step three) | A self-hosted server: single sign-on, admin, shared packs (also for internal docs), the organisation's own AI account, support | Per seat, from learning budgets |

Why these numbers ([sizing-and-pricing.md](sizing-and-pricing.md)):

- They sit under every paid rival: Hello Interview's month is $47, NeetCode's year $119, LeetCode
  Premium's year $159, DesignGurus' year $373 [primary/secondary].
- One-off and lifetime prices are normal here: Hello Interview $299, NeetCode $297, DesignGurus
  sells its system-design roadmap for $345 one-off [primary].
- AI subscription apps churn fast: 6.1% of monthly subscribers remain after a year, against 9.5%
  for apps without AI [secondary, RevenueCat 2026]. A pack bought once, or a campaign with an end
  date, doesn't fight that curve.
- Both fit inside a typical $1,000–2,000 learning stipend without anyone's approval [secondary].

The validation plan tests **A against B**: does this customer buy *ownership of a book layer* or
*access for a campaign*?

---

## 9. Size

| | People | At ~€80 a year | Basis |
|---|---|---|---|
| **TAM**: professional developers using AI coding tools | ~24M | ~€1.9B | 36.5M professional developers [secondary, SlashData] × 65.9% using coding assistants or agents [secondary, Stack Overflow 2026] |
| **SAM**: of those, paying for a usable plan and in a study campaign this year | ~1.2M | ~€96M | × 25% with a personal Plus/Pro plan [assumption] × 20% in a campaign [assumption] |
| **SOM**: reachable and paying within two years | ~720–4,800 | ~€0.05–0.5M | × 2–5% reached through free channels [assumption] × 3–8% paying [assumption] |

The comparables make the same point from the other side: Boot.dev, bootstrapped, is put at $1.3M
(2024) by one tracker and $5.7M by another [secondary]; Taro had 1,250 paying members at the end
of 2023 [primary]; Hello Interview has raised about $5.9M [secondary]. This is a small, profitable
business before it is anything else. The team tier (onboarding takes 3–9 months [secondary,
Swimm survey]; learning budgets average $1,254 per employee [primary, ATD]) is where it could grow.

---

## 10. What kills this, ranked

1. **"I'll just ask ChatGPT."** The free tutors are good enough for most people. *Test:* if fewer
   than 15% return after a week (week 3), the loop doesn't hold and features won't fix it.
2. **Publishers put the loop inside their books.** O'Reilly and Manning already have AI
   assistants; Amazon has Ask this Book. *Answer:* any publisher, local files, figures and a
   schedule; or partner with them for packs.
3. **Interview platforms add retention and explain-back.** Hello Interview already has an AI tutor
   and "Guided Practice" that names missing steps [primary/secondary]. *Answer:* position as
   "understand the book" next to their question banks, not against them; a partnership is
   plausible.
4. **Model-access terms change.** OpenAI's paid path needs approval; Anthropic forbids routing
   through plans. *Answer:* Sign in with ChatGPT, plus optional keys or a local model.
5. **Pack rights.** Companion guides to copyrighted works have lost in court when they took too
   much expression (*Castle Rock v. Carol*, *Warner Bros. v. RDR Books*) [primary]. *Answer:*
   start with openly licensed books, ship no book text, partner with authors
   ([packs-and-rights.md](packs-and-rights.md)).
6. **Too small.** €0.05–0.5M in two years [assumption] is a living, not a venture. Fine for this
   team and course; say it out loud.
7. **Overclaiming.** Prompted self-explanation has a medium effect in a meta-analysis of 64
   reports (g = 0.55) [secondary, summarising Bisra et al. 2018], mostly with undergraduates in
   short studies. Claim understanding and retention, never interview outcomes.
8. **The name.** "Classroom" says school, and a real person's name in a commercial product needs
   a trademark and publicity-rights check; Feynman's estate does license his name commercially
   [secondary].

---

## 11. Validation: four weeks, with kill criteria

| Week | Test | Pass | Fail → |
|---|---|---|---|
| 1 | **15 interviews** with engineers who read DDIA or prepared a system-design interview in the last year (r/ExperiencedDevs, colleagues, alumni). Ask what they did, where they stalled, what they paid for, and who paid | ≥10 describe stalling, forgetting, or not being able to explain it, *unprompted* | The problem isn't felt: stop |
| 2 | **Landing page** with a 30-second clip: passage → protocol figure → explain-back score. Post to Show HN, r/ExperiencedDevs, r/systemdesign | **500** sign-ups | <150: the message is wrong, rewrite before building |
| 3 | **30–50 users** on the *Computer Networks: A Systems Approach* pack (openly licensed, so no rights question), with opt-in usage counts | **≥30%** return after a week; ≥3 explain-backs each | <15%: the loop doesn't hold |
| 4 | **Price test**: half the waitlist sees A (€19 per book), half sees B (€39 for three months), as pre-orders | **≥5%** of the waitlist pays | <2%: back to the Course Pack for bootcamps and interview-prep course makers |

**The one number that decides it:** paid pre-orders from the waitlist. Interest is free.

Interview questions for week 1 (don't pitch; ask about the last time):

1. Tell me about the last time you studied a hard technical book or prepared a design interview.
2. Where did you stop or slow down? What did you do then?
3. What did you use alongside it (courses, ChatGPT, Anki, notes)? What did you pay for?
4. How did you know you understood it? What did you forget by the time it mattered?
5. Did your employer pay for any of it? How did you ask?

---

## 12. Decisions for the team

1. ~~Do we change the first customer to engineers (issue #45)?~~ **Decided 23 November 2026:**
   yes, as the first group we sell to and test with; the app stays general
   ([direction.md](direction.md)).
2. The wedge: system-design interviews, promotions, or "moving into a new field"?
3. The first three packs. Recommended: *Computer Networks: A Systems Approach* (CC BY 4.0),
   *Dive into Deep Learning* (CC BY-SA 4.0), and DDIA only with the authors' or O'Reilly's
   agreement.
4. "No API keys, ever": a rule for the product, or only the default? Proposed in
   [direction.md](direction.md) §4: no key needed for individuals, and organisations bring their
   own AI account.
5. Offer A or offer B first, if the week-4 test can only run one?
6. A new name: now, or after validation?
7. The step-two pilot: which adult course or bootcamp, and which engineering team?
8. The first institutional buyer: companies or universities? Recommended: companies.
9. Paid code we own outright, or dual licensing with a contributor agreement (issue #43)?

---

## Method

Searches and page reads on 9 November 2026: developer population and AI-use surveys, the job
market and interview practice, employer learning spend, 20+ competitors' pricing pages, model
vendors' developer and legal pages, copyright cases and book licences. Prices were read from the
vendor's own page where it loaded (Hello Interview, DesignGurus, NeetCode, ByteByteGo, Educative);
LeetCode, Aced, interviewing.io, Taro and Execute Program's pages didn't load, so their prices are
from secondary sources and marked so. Nothing here is legal advice.
