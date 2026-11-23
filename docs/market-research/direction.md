# Direction: what the app is, who it's for, and in what order

Decided 23 November 2026, and revised the same day after the five forces. Labels as in the other
notes: **[primary]**, **[secondary]**, **[assumption]**. This note builds on the research of
9 November; where it changes that research, it says so.

## Takeaway

**The app is Obsidian for learning: your books and proven learning methods.** A small core that
every learner sees (a library, a reader, notes, review), each learning method a switch, and the
extras off until someone asks for them. It is not a research knowledge base or a context-engineering
tool, and never was (issue #45 weighed both and set them aside). The concrete proposal for the app
is [Incipit issue #36](https://github.com/mihaicristianfarcas/incipit/issues/36).

**Engineers are the first people we win over,** because they already pay for an AI plan, they have
learning budgets, and one of us is this customer. The pitch is learning from the books you own,
with system design as the example, not interview prep.

**We charge for software, not content.** The app is free. Individuals pay for sync and review on a
phone; classes and teams pay per seat for a teacher and mentor view; institutions later pay for a
self-hosted server. Packs for openly licensed books become free examples. We still pay for no model
calls.

| Step | Who uses it | Who pays | What they pay for |
|---|---|---|---|
| **1. Now** | Anyone (the free AGPL app); we court engineers | The learner, or their learning stipend | Sync and phone review |
| **2. Next** | Learners with a teacher or a mentor, adults first | The course, the bootcamp or the team | A teacher and mentor view, per seat |
| **3. Later** | Students, staff and new hires inside an institution | The company, university or bootcamp | A self-hosted server: single sign-on, admin, shared packs, their own AI account, support |

---

## 1. What the five forces said, and the two problems they showed

Four of the five forces are High ([five-forces.md](five-forces.md)), which makes this a hard market
for a *generic* AI study app. Two problems came out of it:

1. **The size.** Packs sold to engineers gave about €0.05–0.5M a year after two years [assumption,
   [sizing-and-pricing.md](sizing-and-pricing.md)]: a living for a small team, not more.
2. **The app does too much.** Reader, notes, flashcards, quizzes, practice, a tutor, a graph of
   ideas, figures, an agent: it meets Obsidian, Anki, RemNote, Gemini Notebook and the interview
   sites all at once, because it shows every tool at once.

A crowded market doesn't rule out a good product. Three products did well in one by being clearly
best at one thing and charging for something the forces don't take away:

- **Obsidian:** plain local files in one of the most crowded markets there is. The app is free and
  people pay for sync; the Course Pack research found Sync at $4–8 a month and concluded that
  people who keep plain files "pay for sync, not for the editor" [secondary, commit `081b7e7`].
- **Anki:** free and open source; sales of its paid iPhone app fund its development [secondary, not
  re-checked for this note].
- **Math Academy:** profitable with no sales team, at $49 a month, in education [secondary, commit
  `081b7e7`].

## 2. The product: a small core, and methods you switch on

Obsidian is simple not because it does little, but because its core is tiny and everything else can
be switched on and off. The same shape, for learning:

| | What's in it |
|---|---|
| **Core** (always there) | The library, the reader (highlights, notes, Explain and Ask, asking the whole book), notes as plain files, spaced review |
| **Methods** (one switch each) | Explain it back (on), quizzes and practice (on), figures (on), a concept map (on, an open question), tutor sessions, Connect, further reading (off) |
| **Extras** (off by default) | The agent that works on the vault |

Each method says what it does and why it works, and the defaults follow the evidence. Practice
testing and spaced practice are the two study techniques rated most useful in a review of ten
(Dunlosky et al., 2013); self-explanation has a medium effect across 64 reports (Bisra et al.,
2018, g = 0.55 [secondary, as in README §10]); people learn better from words with pictures than
from words alone (Mayer's multimedia principle); concept maps help learning (Nesbit and Adesope,
2006). [Primary studies, cited from the literature, not re-read for this note.]

Switching a method off hides it and deletes nothing: what it made stays in the vault. In Incipit the
sidebar goes from 10 pages to 6 and the selection menu shows only the methods that are on; the
details are in [issue #36](https://github.com/mihaicristianfarcas/incipit/issues/36).

**Where this puts us, and what must be obvious in the first minute.** Next to RemNote (notes,
flashcards, PDFs and AI, $8–18 a month [secondary, [competitors.md](competitors.md) §5]) and
Obsidian with free plugins (a spaced-repetition plugin already exists). Three differences:

1. **Books come first:** a real reader with your place, your notes and your figures, not a PDF
   attached to a note.
2. **The methods are built in and work together:** explaining back finds your gaps, the gaps become
   reviews, and there are no five plugins to assemble.
3. **Your files, your AI plan:** RemNote is hosted; this is plain files on your machine, on the
   ChatGPT or Claude plan you already pay for.

## 3. Who first: engineers

Selling to students, engineers and researchers at once costs us in five places: one message for
nobody, a test that can't say which group failed, three times the content, features that pull
apart, and rivals from three industries. Each group is a different market:

| | Students | Engineers | Researchers |
|---|---|---|---|
| What they read | Assigned textbooks | A few standard technical books | Papers, many of them |
| Trigger and deadline | Exams, the semester | Interview, promotion, a new field | Literature review, a paper, a thesis |
| Who pays | Mostly nobody; parents or the university | Themselves, or a learning stipend | Grants, the institution |
| Already pay for an AI plan | Rarely (why the 9 November research moved away from them) | Usually | Not researched |
| Our focus | Step two, through teachers | **Step one** | Not the focus; papers are one more kind of source |

Engineers first, for three reasons:

1. **They have the AI and the budget.** 65.9% of developers use AI coding assistants or agents
   [secondary, Stack Overflow 2026]; typical learning stipends are $1,000–2,000 a year [secondary]
   ([demand.md](demand.md)).
2. **One of us is this customer:** a software engineer learning system design, who can interview
   colleagues in week 1 and use the app for their own study.
3. **They are the kind of people who took up Obsidian early** [our judgment], and the research for
   them (competitors, prices, a four-week test) is already done.

The app stays open to everyone, and people cross groups: a PhD student is a student and a
researcher, and every engineer was a student.

## 4. What we charge for

**Not book packs.** A pack per standard book is a content business: rights deals with publishers,
and about 40 hours of expert review per book [assumption, [sizing-and-pricing.md](sizing-and-pricing.md)
§6]. It also makes publishers, who are building their own AI readers, a supplier our revenue depends
on. Packs for openly licensed books (*Computer Networks: A Systems Approach*, *Dive into Deep
Learning*) stay, free, as the best demo of what the app does;
[packs-and-rights.md](packs-and-rights.md) still applies to them, and to any pack made later with an
author.

| Who | What they pay for | Price to test | Anchors |
|---|---|---|---|
| **Individuals** (step one) | Sync between computers and review on a phone | **A:** €48 a year; **B:** €39 for three months, all included [assumption] | Obsidian Sync $4–8 a month [secondary, `081b7e7`]; RemNote Pro $8, Pro with AI $18 a month [secondary] |
| **Classes and teams** (step two) | The teacher and mentor view, with sync for everyone in it | Per seat, set in the pilot | €5–40 a student a year in education [secondary, `081b7e7`]; O'Reilly's team plan $499 per member a year [secondary] |
| **Institutions** (step three) | A self-hosted server: single sign-on, admin, shared packs, their own AI account, support | Per seat | Learning spend of $1,254 per employee a year [primary, ATD] |

Yearly over monthly: AI apps keep 21.1% of yearly subscribers after a year against 6.1% of monthly
ones [secondary, RevenueCat 2026, [sizing-and-pricing.md](sizing-and-pricing.md) §3]. Sync and phone
review cost us little per user and nothing per book. Inference stays at zero: individuals use their
own plan, organisations their own AI account.

## 5. Size, honestly

This shape widens the market (anyone learning from books, not only engineers before an interview),
but it doesn't make the business big by itself. Sync brings little money per person, and it pays only
after a large free user base, which takes years and a community. The size estimate in
[sizing-and-pricing.md](sizing-and-pricing.md) was made for packs and is not redone here.

For scale, as arithmetic and not a forecast: €1M a year takes about 21,000 people paying €48 a year,
or 50,000 seats at €20. The first is a large free audience converting; the second is a few hundred
classes and teams. **Classes and teams are where the size comes from:** per-seat money a single
learner never pays, and a teacher view that no chatbot and no note-taking app offers.

---

## 6. Step two: the teacher and mentor view

**What it is.** A learner shares a view of their learning with one person: their explain-backs and
the gaps found in them, quiz and review results, the concept map as it grows, and how far through
each book they are. The teacher sees *how* the learner understands, not just a score, and can leave
a question in the learner's margin.

**Why it matters.**

- **One feature, two markets:** a student and their teacher; a new hire and their mentor, checking
  that the new hire really understands the system ([competitors.md](competitors.md) §7: onboarding
  that ends in understanding).
- **It is the cheap way to many learners:** the Course Pack research found the person in front of
  the room reaches 30–200 learners at once, and the shape has paid precedents: Knewton Alta (the
  instructor adopts, the student pays, $49.95 a term), ALEKS, Khanmigo (free for teachers, districts
  on quote) [secondary, commit `081b7e7`].
- **No chatbot can give a teacher this:** months of one learner's explanations, tied to the pages
  of the book.

**Four rules.**

1. **Adults first.** A child's learning data brings parental consent (GDPR article 8 lets each EU
   country set the age between 13 and 16), COPPA for under-13s in the US, FERPA for US school
   records, and school procurement. Start with university courses, bootcamps and mentoring at work.
   Not legal advice: check before any pilot with minors.
2. **Share a view, not the vault.** Sharing is the learner's choice, per book or per topic, and can
   be withdrawn; private notes never leave. A second brain that someone else reads stops being
   honest.
3. **This changes one earlier rule, on purpose.** The Course Pack research said every signal is
   about the material, never the person (its "revision list"). That stays for everything pooled
   across learners. The teacher view is about one person only because that person chose to share
   it.
4. **It needs sync.** Sharing needs a server; build it once, and it serves sync (step one), the
   teacher view (step two) and the self-hosted product (step three).

**The pilot.** One adult course or bootcamp cohort (10–30 learners) and one engineering team with a
mentor, for four weeks. Pass [assumption]: at least half the learners choose to share; the teacher
opens the view every week; the teacher names one thing they did differently because of it. Fail:
learners won't share, which means the view feels like surveillance; change what it shows first.

## 7. Step three: institutions, self-hosted and paid

**The model: open core on the AGPL.** Anyone can self-host the free app; an organisation pays for
what only organisations need. Issue #43 set this out, and it is why the licence moved to the AGPL:
no one can turn the code into a closed hosted product. GitLab and Mattermost sell this way; in
education, universities self-host Moodle.

**What is paid** (if the free version does everything, organisations self-host it and never pay):
single sign-on and user provisioning; admin and policy (which AI provider, what data may leave);
audit logs; shared, managed packs, including for the organisation's own documents; the teacher and
mentor view across a course or a team, with progress reports; support with a service level.

**AI access: organisations bring their own** (Azure OpenAI, Amazon Bedrock, Google Vertex, or a
local model). Every vendor allows API use, so Anthropic's ban on routing requests through consumer
plans ([model-access.md](model-access.md) §2) doesn't touch this tier, and we still pay nothing for
inference. "No API keys, ever" becomes **"no key needed for individuals; organisations bring their
own"**.

**What to watch.**

1. **There's nothing to self-host yet:** the app is local and has no server. The product here is a
   new server (sync, sharing, admin, single sign-on, reports, the organisation's AI connection).
2. **Owning the code we sell:** either the paid parts are separate code we own outright, or the whole
   app is dual-licensed, which needs every copyright holder's agreement or a contributor agreement
   (issue #43). Check code taken from other projects too, such as the app's UI kit. Not legal
   advice.
3. **Selling to institutions is its own job:** long cycles, security questionnaires, a data
   processing agreement (GDPR article 28), often SOC 2 or ISO 27001, a legal entity, references.
   Open-core companies usually reach it after a large free user base.
4. **The first buyer:** companies (bigger budgets, faster, and step one's engineers are already
   inside; but crowded with Glean, Unblocked, Swimm) or universities (self-hosting matters most to
   them, and the teacher view fits them exactly; but slow procurement and small per-seat budgets).
   **Recommended** [our judgment]: companies first, universities through the step-two pilot.

**The test.** About ten conversations with engineering managers or learning teams (or university IT
and teaching staff), ending in one signed pilot or letter of intent.

---

## 8. What this changes in the research

- **README:** sections 1, 3, 8, 11 (the week-4 price test) and 12 are updated.
- **Packs:** no longer the paid product; open packs stay as free demos
  ([packs-and-rights.md](packs-and-rights.md) still applies).
- **The five forces:** the ratings stand; the takeaway now reads as this strategy
  ([five-forces.md](five-forces.md)).
- **The four-week test:** weeks 1–3 unchanged; week 4 tests sync and phone review (A, yearly)
  against a three-month campaign (B).

## Open questions

1. The concept map: on or off by default ([Incipit #36](https://github.com/mihaicristianfarcas/incipit/issues/36))?
2. The example within engineers: system design (our own case), promotions, or a new field?
3. The step-two pilot: which adult course or bootcamp, and which engineering team?
4. The first institutional buyer: companies or universities? Recommended: companies.
5. Paid code we own outright, or dual licensing with a contributor agreement (issue #43)?
6. The name.
