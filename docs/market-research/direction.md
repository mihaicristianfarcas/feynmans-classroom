# Direction: who it's for, and in what order

Decided 23 November 2026. Labels as in the other notes: **[primary]**, **[secondary]**,
**[assumption]**. This note adds to the research of 9 November; it doesn't replace any of it.

## Takeaway

The app stays general: **a second brain for learning**. You read, map the concepts, explain them
back and keep what you understood, and you see how you learn. It is not a research knowledge base or
a context-engineering tool, and never was (issue #45 weighed both and set them aside).

What narrows is who we sell to and test with first: **software engineers learning hard technical
books**. They already pay for an AI plan, they have learning budgets, and one of us is this
customer. Two steps follow, each opening the app to a group it already suits:

| Step | Who uses it | Who pays | What they pay for |
|---|---|---|---|
| **1. Now** | Anyone (the free AGPL app); we sell to engineers | The engineer, or their learning stipend | A book pack (€19) or a three-month campaign (€39), tested in four weeks |
| **2. Next** | Learners with a teacher or a mentor, adults first | To learn in the pilot: likely the course, the bootcamp or the team | A shared view: the learner shows a teacher how they understand, kept in sync |
| **3. Later** | Students, staff and new hires inside an institution | The institution: a company, a university, a bootcamp | A self-hosted server: single sign-on, admin, shared packs, their own AI account, support |

---

## 1. Why not every group at once

The core loop (read, ask in the margin, see a figure, explain it back, review) works for any book,
and the native rewrite (Incipit) is already general-purpose. Selling to everyone at once is the
problem, because each group is a different market:

| | Students | Engineers | Researchers |
|---|---|---|---|
| What they read | Assigned textbooks | A few standard technical books | Papers, many of them |
| Trigger and deadline | Exams, the semester | Interview, promotion, a new field | Literature review, a paper, a thesis |
| Who pays | Mostly nobody; parents or the university | Themselves, or a learning stipend | Grants, the institution |
| Already pay for an AI plan | Rarely (why the 9 November research moved away from them) | Usually | Not researched |
| Rivals | ChatGPT, Gemini Notebook, Quizlet, Anki, Math Academy | Hello Interview, O'Reilly, NeetCode | Elicit, Consensus, SciSpace (issue #45) |
| Packs worth making | One per course textbook | One per standard book | Hardly any: everyone reads different papers |
| Our focus | Step two, through teachers | **Step one** | Not the focus; papers are one more kind of source |

Selling to all three at once costs us in five places:

1. **The message.** Almost nobody reads "for students, engineers and researchers" and thinks
   "that's me". The week-2 landing page needs one person in one situation.
2. **The validation.** If sign-ups are low, we can't tell which group didn't want it.
3. **The packs.** They're made per book, so three groups triple the content, and researchers share
   no books.
4. **The features.** Students want quizzes tied to their exams, researchers paper import and
   citations, engineers figures of systems. A small team does one of these well.
5. **The five forces.** Being broad doesn't escape them; it adds rivals from three industries
   ([five-forces.md](five-forces.md)).

Being broad is free in one place: **the app itself**. The free version welcomes everyone, and people
cross groups (a PhD student is a student and a researcher; every engineer was a student).

## 2. Why engineers first

1. **They already have the AI and the budget.** 65.9% of developers use AI coding assistants or
   agents [secondary, Stack Overflow 2026], and typical learning stipends are $1,000–2,000 a year
   [secondary]. Students rarely have a paid plan or a budget ([demand.md](demand.md)).
2. **One of us is this customer:** a software engineer learning system design. We can interview
   colleagues in week 1, use the app for our own study, and tell when a figure or a question is
   wrong.
3. **The research is done for them.** Competitors, prices, size and a four-week test with kill
   criteria are in this folder; the five forces for this step are in
   [five-forces.md](five-forces.md).

---

## 3. Step two: the teacher and mentor view

**What it is.** A learner shares a view of their learning with one person: their explain-backs and
the gaps found in them, quiz and review results, the concept map as it grows, and how far through
each book they are. The teacher sees *how* the learner understands, not just a score, and can leave
a question in the learner's margin.

**Why it matters.**

- **One feature, two markets.** Student and teacher; new hire and mentor. Inside a company, a
  senior engineer checking that a new hire really understands the system is the same feature. It
  is the team tier's angle in [competitors.md](competitors.md) §7: onboarding that ends in
  understanding.
- **It is the cheap way to many learners.** The Course Pack research (commit `081b7e7`) found the
  person in front of the room reaches 30–200 learners at once. The shape has paid precedents:
  Knewton Alta (the instructor adopts, the student pays, $49.95 a term), ALEKS (instructors in
  higher education), Khanmigo (free for teachers, districts on quote) [secondary, as checked in
  that research].
- **No chatbot can give a teacher this:** months of one learner's explanations, tied to the pages
  of the book.

**Four rules.**

1. **Adults first.** A child's learning data brings parental consent (GDPR article 8 lets each EU
   country set the age of consent between 13 and 16), COPPA for under-13s in the US, FERPA for US
   school records, and school procurement. Start with university courses, bootcamps and mentoring
   at work. Not legal advice: check before any pilot with minors.
2. **Share a view, not the vault.** Sharing is the learner's choice, per book or per topic, and can
   be withdrawn; private notes never leave. A second brain that someone else reads stops being
   honest.
3. **This changes one earlier rule, on purpose.** The Course Pack research said every signal is
   about the material, never about the person (its "revision list"). That stays for everything
   pooled across learners: a course maker or a pack author sees which paragraph fails, never who.
   The teacher view is about one person only because that person chose to share it.
4. **It needs sync.** The app is local, so sharing needs a server. Build it once: it is step three's
   product too.

**The pilot.** One adult course or bootcamp cohort (10–30 learners) and one engineering team with a
mentor, for four weeks. Pass [assumption]: at least half the learners choose to share; the teacher
opens the view every week; the teacher names one thing they did differently because of it. Fail:
learners won't share, which means the view feels like surveillance; change what it shows before
building more.

---

## 4. Step three: institutions, self-hosted and paid

**The model: open core on the AGPL.** Anyone can self-host the free app; an organisation pays for
what only organisations need. Issue #43 set this out (enterprise and universities, hosted by us or
in their own cloud, with single sign-on and admin), and it is why the licence moved to the AGPL: no
one can turn the code into a closed hosted product. GitLab and Mattermost sell this way; in
education, universities self-host Moodle.

**What is paid** (if the free version does everything, organisations self-host it and never pay):

- Single sign-on (SAML, OIDC) and user provisioning (SCIM)
- Admin and policy: which AI provider, what data may leave
- Audit logs
- Shared, managed packs, including packs for the organisation's own documents
- The teacher and mentor view across a course or a team, with progress reports
- Support with a service level, and help deploying

Priced per seat [assumption, to test]. Anchors: O'Reilly's team plan at $499 per member a year
[secondary]; learning spend of $1,254 per employee a year [primary, ATD].

**AI access: organisations bring their own.** A company won't run its staff on personal ChatGPT
plans; it connects its own account (Azure OpenAI, Amazon Bedrock, Google Vertex) or a local model.
Every vendor allows API use, so Anthropic's ban on routing requests through consumer plans
([model-access.md](model-access.md) §2) doesn't touch this tier, and we still pay nothing for
inference: the customer does. "No API keys, ever" becomes **"no key needed for individuals;
organisations bring their own"**. For individuals the native rewrite already plans Sign in with
ChatGPT and keeps the CLIs.

**What to watch.**

1. **There's nothing to self-host yet.** The app is local and has no server. The product here is a
   new server: sync, sharing, admin, single sign-on, reports and the organisation's AI connection.
2. **Owning the code we sell.** Either the paid parts are separate code we own outright, or the
   whole app is dual-licensed, which needs every copyright holder's agreement or a contributor
   licence agreement (issue #43). Check code taken from other projects too, such as the native
   rewrite's UI kit. Not legal advice.
3. **Selling to institutions is its own job:** months-long cycles, security questionnaires, a data
   processing agreement (GDPR article 28), often SOC 2 or ISO 27001, a legal entity, references.
   Open-core companies usually reach it after a large free user base, not before.
4. **The first buyer:**

| | Companies (onboarding, mentoring) | Universities (courses, teaching staff) |
|---|---|---|
| For | Bigger budgets ($1,254 per employee [primary, ATD]); faster decisions; step one's engineers are already inside | Self-hosting matters most to them (student data under GDPR); they already run open-source learning software (Moodle); the teacher view fits them exactly |
| Against | Crowded: Glean, Unblocked, Swimm, DeepWiki ([competitors.md](competitors.md) §7) | Slow procurement; small per-seat budgets (€5–40 a student a year in the Course Pack research's anchors [secondary]); integration with their course platform (LTI) expected |

**Recommended** [our judgment]: companies first, because step one's engineers lead to them;
universities second, through the step-two pilot.

**The test.** About ten conversations with engineering managers or learning teams (or, for
universities, IT and teaching staff), ending in one signed pilot or letter of intent.

---

## 5. What this changes in the research

- The README's "who it is not for, at first" now means *who we don't sell to first*: students and
  companies come back as steps two and three.
- The Team tier in README §8 becomes steps two and three.
- The four-week validation plan is unchanged: it tests step one.
- The five forces for step one, and how they shift in steps two and three, are in
  [five-forces.md](five-forces.md).

## Open questions

1. The wedge within engineers: system-design interviews (our own case), promotions, or a move into
   a new field?
2. The step-two pilot: which adult course or bootcamp, and which engineering team?
3. The first institutional buyer: companies or universities? Recommended: companies.
4. Paid code we own outright, or dual licensing with a contributor agreement (issue #43)?
5. The questions still open in README §12: the first packs, offer A or B, the name.
