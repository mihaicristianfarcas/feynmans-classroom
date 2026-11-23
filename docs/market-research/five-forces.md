# Five forces: learning hard technical books with AI

Written 23 November 2026 for the team's Miro board (Porter's five forces), from the notes beside it.
Labels as in the other notes: **[primary]**, **[secondary]**, **[assumption]**.

**The market:** AI-assisted tools for people who have to understand a hard technical book.
**Scope:** step one of [direction.md](direction.md): individuals, software engineers first. How the
forces shift in steps two and three is at the end.

**How to read the factors:** ↑ makes the force stronger (worse for us), ↓ makes it weaker. The
weight (High, Medium, Low) is how much the factor counts, and matches the tag on the board's sticky
note.

## Summary

| Force | Rating | In one line |
|---|---|---|
| Threat of new entrants | **High** | The basics are cheap to build and big platforms add them in one update; only checked packs, book rights and AI-access terms slow anyone down |
| Bargaining power of suppliers | **Medium** | Three AI vendors and a few publishers control key inputs and also compete with us, but we pay them nothing and can switch vendors |
| Rivalry among existing competitors | **High** | Interview prep, publishers, free AI tutors and spaced-repetition tools compete for the same hours; nobody sells our combination |
| Bargaining power of buyers | **High** | Free alternatives, plain files that make leaving easy, and fast churn in AI apps; a deadline and learning budgets soften it |
| Threat of substitutes | **High** | "I'll just ask ChatGPT", or skip the book for a course; evidence that delegating to AI stops learning works for us |

**What it means:** four forces out of five are High, so this is a hard market for a generic AI study
app. The slot we can hold is narrow: *the book you own, drawn as figures, explained back and kept,
on the AI plan you already pay for.* So we host no model, sell one-off packs or fixed-length
campaigns rather than subscriptions, and compete on what is left three weeks later, not on
explaining a passage.

---

## 1. Threat of new entrants: High

| | Factor | Weight | Source |
|---|---|---|---|
| ↑ | Low start-up cost: no servers and no AI bill (the user's own ChatGPT or Claude plan pays), and coding agents build the basics fast | High | [model-access.md](model-access.md) §5; the agents' speed is our judgment |
| ↑ | Big tech enters in one update: Amazon added "Ask this Book" to Kindle (December 2025) | High | [secondary], [competitors.md](competitors.md) §4 |
| ↓ | Hard to copy: checked, interactive figures and question banks per book, about 40 hours of expert review each | Medium | [assumption], [sizing-and-pricing.md](sizing-and-pricing.md) §6 |
| ↓ | Book rights: a pack can't contain the book's text, so it needs open licences or author deals | Medium | [primary], [packs-and-rights.md](packs-and-rights.md) §2 |
| ↓ | AI access is gated: Anthropic bans apps routing requests through Claude plans; OpenAI must approve paid apps | Medium | [primary], [model-access.md](model-access.md) §1–2 |
| ↑ | Buyers are easy to reach for free: Hacker News, r/ExperiencedDevs (~300–425k members), newsletters | Medium | [secondary], [demand.md](demand.md) §7 |
| ↑ | Our code is open (AGPL), but any hosted copy has to publish its source too | Low | Licence (issue #43) |

## 2. Bargaining power of suppliers: Medium

The suppliers are the AI vendors (model access), publishers and authors (the books packs are made
for), reviewers (pack checking) and payment providers.

| | Factor | Weight | Source |
|---|---|---|---|
| ↑ | Three AI vendors (OpenAI, Anthropic, Google) control model access and can change terms at will | High | [model-access.md](model-access.md) §4 |
| ↑ | Publishers own the key books (DDIA: O'Reilly, all rights reserved) and build their own AI readers (O'Reilly Answers, Manning liveBook) | High | [primary/secondary], [packs-and-rights.md](packs-and-rights.md) §3, [competitors.md](competitors.md) §3 |
| ↓ | We pay €0 for AI: each user's own plan covers every answer | Medium | [model-access.md](model-access.md) §5 |
| ↓ | Easy to switch AI vendor: the app runs on Codex, Claude Code and OpenCode; the Gemini CLI gives a personal account about 1,000 requests a day free | Medium | The app; [secondary], [model-access.md](model-access.md) §3 |
| ↓ | Open books are free supply: *Computer Networks: A Systems Approach* (CC BY 4.0), *Dive into Deep Learning* (CC BY-SA 4.0) | Medium | [packs-and-rights.md](packs-and-rights.md) §3 |
| ↓ | Reviewers and payments are ordinary inputs (~€25 an hour, ~3% card fees) | Low | [assumption], [sizing-and-pricing.md](sizing-and-pricing.md) §6 |

**Why Medium and not High:** only two vendors set terms (Anthropic's rules for third-party apps
tightened in 2026; OpenAI must approve paid apps), but we pay them nothing and already switch
between three. Publishers matter only for paid packs of closed books.

## 3. Rivalry among existing competitors: High

| | Factor | Weight | Source |
|---|---|---|---|
| ↑ | Interview prep owns the deadline money: Hello Interview $89 a year, NeetCode $119, DesignGurus $373 | High | [primary], [competitors.md](competitors.md) §1 |
| ↑ | Gemini Notebook is free: answers from your own documents, with flashcards, quizzes and mastery tracking | High | [secondary], [competitors.md](competitors.md) §4 |
| ↑ | Rivals are adding our features: Hello Interview's AI tutor flags missing steps; Educative has an AI tutor | High | [primary/secondary], [competitors.md](competitors.md) §2–3 |
| ↑ | Big players consolidate: Coursera and Udemy merged in May 2026 (290M+ learners reported) | Medium | [primary/secondary], [competitors.md](competitors.md) §3 |
| ↑ | Retention tools: Anki (free), RemNote with AI ($18 a month) makes cards from PDFs | Medium | [secondary], [competitors.md](competitors.md) §5 |
| ↓ | Nobody sells our combination: figures you can play with, explain-back graded against the book, and a review schedule, on the book you own | Medium | [competitors.md](competitors.md), takeaway |
| ↓ | Cost edge: we host no AI, so a gross margin of ~75–95% against ~52% on average for AI products | Medium | [assumption] and [secondary, ICONIQ], [sizing-and-pricing.md](sizing-and-pricing.md) §6 |

## 4. Bargaining power of buyers: High

| | Factor | Weight | Source |
|---|---|---|---|
| ↑ | Easy to switch: free alternatives exist, and our notes are plain files they can take anywhere | High | [competitors.md](competitors.md) §4–5; the vault design |
| ↑ | AI apps churn fast: 6.1% of monthly subscribers stay a year, against 9.5% for apps without AI | High | [secondary, RevenueCat 2026], [sizing-and-pricing.md](sizing-and-pricing.md) §3 |
| ↑ | Price-sensitive: they already pay ~$20 a month for ChatGPT Plus and won't pay twice for "AI" | Medium | [sizing-and-pricing.md](sizing-and-pricing.md) §4 |
| ↓ | An urgent need with a deadline: a system-design interview, a promotion, a move into a new field | Medium | [demand.md](demand.md) §4 |
| ↓ | Cheap next to budgets: €19–39 is 2–4% of a $1,000–2,000 learning stipend | Medium | [secondary], [demand.md](demand.md) §6 |
| ↓ | Many small buyers (individual engineers): none can dictate terms | Low | Our judgment |

## 5. Threat of substitutes: High

| | Factor | Weight | Source |
|---|---|---|---|
| ↑ | "I'll just ask ChatGPT": general chatbots explain any passage for free; our first risk | High | README §10 |
| ↑ | Skip the book: interview courses and question banks (Hello Interview, Grokking, ByteByteGo's 1.35M+ newsletter readers) | High | [primary], [competitors.md](competitors.md) §2 |
| ↑ | Videos and courses: YouTube (ByteByteGo ~1.4M subscribers), Coursera and Udemy | Medium | [secondary], [demand.md](demand.md) §7 |
| ↑ | Old-school study: read, take notes, write Anki cards by hand, for free | Medium | [competitors.md](competitors.md) §5 |
| ↓ | Delegating to AI stops learning: engineers who learned with AI scored 50% against 67% without (Anthropic trial, January 2026) | Medium | [primary], [demand.md](demand.md) §3 |
| ↓ | Interviews are back in person (72.4% of recruiting leaders, Gartner): you have to understand without AI | Medium | [secondary], [demand.md](demand.md) §4 |
| ↑ | Coding agents' learning modes (Claude Code's "Learning" style) teach the code in front of you, not a book | Low | [primary], [competitors.md](competitors.md) §4 |

---

## How the forces shift in steps two and three

When teachers and institutions come in ([direction.md](direction.md)), the user is no longer the
only buyer. Our judgment, to check when we get there:

| Force | Step one | Steps two and three | Why |
|---|---|---|---|
| New entrants | High | Medium | Single sign-on, security reviews, compliance and references are barriers a weekend project doesn't clear |
| Suppliers | Medium | Low–Medium | Organisations bring their own AI account, and every vendor allows API use; the books still matter |
| Rivalry | High | High | Adds onboarding tools (Glean, Unblocked, Swimm) and education platforms (Moodle, Knewton Alta, ALEKS, Khanmigo) |
| Buyers | High | Medium | Fewer, bigger buyers who negotiate hard, but once single sign-on, data and habits are in place, leaving costs them |
| Substitutes | High | Medium–High | For a teacher the substitute is grading and office hours; for a company, mentoring and internal docs |
