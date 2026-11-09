# Demand: who, how many, and why now

Checked 9 November 2026. Labels: **[primary]** the source's own page, filing or paper;
**[secondary]** press, aggregator or review site; **[assumption]** ours.

## Takeaway

There are roughly 36–48 million developers, two-thirds of whom use AI coding tools every week,
and the ones with money are mid-level and senior engineers. Three things make 2026 a good moment
to sell them *understanding*: evidence that delegating to AI stops people learning, a hiring
recovery led by senior roles with interviews moving back in person, and a new edition of the most
recommended system-design book. Their employers already budget about $1,000–2,000 a year each for
learning. What we could not find: an independent figure for how many interview loops include
system design, and how many engineers personally pay for a ChatGPT or Claude plan.

---

## 1. How many developers

- SlashData estimates **47.2M developers** worldwide in 2025, of whom **36.5M are professional**,
  up from 21.8M professionals in early 2022 [secondary, citing
  [SlashData](https://slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there)].
  A later SlashData figure of 48.4M (Q3 2025) is also quoted [secondary].
- Other estimates differ by definition: Evans Data 27M (2024), IDC 40.2M (2025), JetBrains 19.6M
  professional (2024) [secondary,
  [ShiftMag](https://shiftmag.dev/there-are-47-million-developers-in-the-world-5200),
  [Keyhole](https://keyholesoftware.com/software-development-statistics)].
- GitHub's 180M+ accounts count every account ever made and are not a population figure.

**Use:** 36.5M professional developers as the top of the funnel, with the range stated.

## 2. They use AI every day, and trust it only with sources

- **Stack Overflow 2026** (reported October 2026): 80% use AI tools at least an hour a day; **65.9%
  use coding assistants or agents**, 62.5% general chat tools, 26.2% automated agent workflows;
  17.2% use none [secondary,
  [IT Brief](https://itbrief.co.uk/story/stack-overflow-survey-shows-developers-trust-ai-with-caveats),
  [LeadDev](https://leaddev.com/technical-direction/trust-in-ai-coding-tools-is-plummeting)].
- Trust is conditional: **48%** trust AI output only when they can easily verify it, 16.3% only for
  low-risk tasks, 6.6% for important decisions; **93%** say source attribution matters (another
  report gives 78.7%, so the question wording may differ) [secondary, same sources].
- In 2025, 46% distrusted the accuracy of AI output, up from 31% a year earlier; 3% highly trusted
  it [secondary, [ITPro](https://www.itpro.com/software/development/developers-arent-quite-ready-to-place-their-trust-in-ai-nearly-half-say-they-dont-trust-the-accuracy-of-outputs-and-end-up-wasting-time-debugging-code)].
- Scale of the coding agents themselves: Claude Code passed **$2.5B** run-rate revenue (February
  2026) [secondary]; Codex passed **4M weekly developers** (April 2026) [secondary]; Cursor is
  reported at **$2B ARR** (February 2026) [secondary,
  [Digital Applied](https://www.digitalapplied.com/blog/openai-codex-4m-weekly-developers-growth-data),
  [Context Studios](https://contextstudios.ai/blog/claude-code-25b-arr-what-it-means-for-builders)].
  These figures aren't comparable with each other (weekly, cumulative, revenue).

**For us:** the customer already has the AI tool and pays for it, and already wants answers tied
to sources. Answers anchored to the exact passage speak to the 48% and the 93%.

## 3. AI can stop them learning

- **Anthropic's randomized trial** (published 29 January 2026; Shen and Tamkin, arXiv 2601.20245):
  52 engineers learned Trio, an unfamiliar Python async library, with or without AI. The AI group
  scored **50%** on the follow-up quiz against **67%** for hand-coding (p = 0.01), with the biggest
  gap on debugging; time to finish was about the same (23 vs 25 minutes, not significant). Low
  scorers delegated or let AI debug; **high scorers used AI to ask for explanations and conceptual
  answers** [primary, [Anthropic](https://www.anthropic.com/research/AI-assistance-coding-skills),
  [arXiv](https://www.arxiv.org/pdf/2601.20245)]. Critics note it measures one hour of learning one
  library [secondary, [InfoQ](https://infoq.com/news/2026/02/ai-coding-skill-formation/)].
- A "State of AI 2026" survey is reported as finding **68%** agree their skills are diminishing as
  they use more AI [secondary, original not checked,
  [Pulse](https://www.pulse.bot/cto-pulse/news/ai-tools-spark-engineer-skill-erosion-survey-finds-growing-deskilling-concern-98215a36-f091-4b2a-b538-78f8573fc616)].
  Treat as directional.

**For us:** this is the strongest "why now". The trial's own finding, that AI used for
comprehension preserved learning, describes the product: explain, visualize, explain back.

## 4. The job market: seniors up, juniors down, interviews in person

- **Postings.** Indeed Hiring Lab (July 2026): US software-development postings up **~15%** since
  late February 2025 while all postings fell ~7%; still **27.5% below** pre-pandemic. **71%** of the
  rise from May 2025 to May 2026 was for **senior** roles; 37% mention AI in the title [secondary,
  citing Indeed; [OfficeChai](https://officechai.com/ai/us-software-job-postings-are-up-15-since-launch-of-claude-code-while-overall-job-postings-are-down-7-indeed-data/),
  [CIO](https://www.cio.com/article/4195780/it-hiring-sees-a-boost-as-software-development-jobs-slowly-bounce-back.html)].
  India's software postings fell 12.3% over three months in a separate Indeed release [secondary].
- **Layoffs.** Layoffs.fyi counted about **128,500** tech layoffs from 1 January to 10 September
  2026, already above all of 2025 (122,606) [secondary; snapshots differ, check the live tracker].
  Layoffs create job seekers (who prepare interviews) and cut budgets.
- **Juniors.** Stanford Digital Economy Lab ("Canaries in the Coal Mine", August 2025): workers aged
  22–25 in AI-exposed jobs saw a 13% relative employment decline; the youngest software developers'
  employment was about **20% below** its late-2022 peak by mid-2025 [secondary,
  [LeadDev](https://leaddev.com/hiring/young-devs-steepest-losses-exposed-roles-stanford-study-finds),
  [Big Think](https://bigthink.com/business/are-young-workers-canaries-in-the-ai-coal-mine/)].
- **Interviews back in person.** Google, Cisco and McKinsey were reported reinstating in-person
  rounds in August 2025; Gartner is cited as finding **72.4%** of recruiting leaders now run
  in-person interviews against fraud [secondary,
  [Entrepreneur](https://www.entrepreneur.com/business-news/google-mckinsey-reintroduce-in-person-interviews-due-to-ai/496041),
  [Computerworld](https://www.computerworld.com/in/hiring/)]. Vendor data claims 38.5% of 19,368
  remote interviews showed cheating behaviour [secondary, vendor with an interest].
- **System design in loops.** Vendors say it is "almost always" included for mid and senior roles,
  and increasingly for mid-level (L4) [secondary, vendor claims,
  [DesignGurus](https://www.designgurus.io/answers/detail/how-common-are-system-design-interviews)].
  **Gap:** no independent share found.

**For us:** start with mid-level and senior engineers. They're being hired, they face design
rounds, and they have to show understanding without an assistant in the room.

## 5. What they read, and how they learn

- **69%** of developers learned a new technology or language in the past year; **44%** used AI to
  learn something new (37% in 2024) [secondary, Stack Overflow 2025,
  [IT Brief](https://itbrief.com.au/story/developers-adopt-ai-tools-but-trust-issues-persist-survey-finds)].
  The survey's breakdown by source (books, documentation, video) wasn't reachable; check
  [survey.stackoverflow.co/2025](https://survey.stackoverflow.co/2025/).
- **DDIA second edition** (Kleppmann and Riccomini): O'Reilly lists February 2026, retailers 27
  February to early March, about 650 pages, with new material on object storage, multi-cloud and AI
  pipelines [primary, [O'Reilly](https://www.oreilly.com/library/view/designing-data-intensive/9781098119058/);
  secondary, [HackerNoon](https://hackernoon.com/rethinking-kleppmanns-designing-data-intensive-applications)].
- Stack Overflow started a separate survey on *learning with AI* in January 2026 [primary,
  [Stack Overflow blog](https://stackoverflow.blog/2026/01/29/are-you-learning-with-ai-we-want-to-know-about-it/)]:
  worth reading when its results come out.

## 6. Who pays: employers' learning budgets

- **ATD State of the Industry 2025** (2024 data): **$1,254** direct learning spend per employee,
  **13.7** formal learning hours [primary,
  [ATD PDF](https://assets.td.org/m/483691e33fbdf4db/original/State_of_the_Industry_PDF_Download_2025.pdf)].
  The 2026 report (2025 data) puts hours at 16.7 [primary,
  [ATD blog](https://www.td.org/content/atd-blog/2026-state-of-the-industry-report-indicates-latest-td-trends)].
- **Stipends at tech companies** cluster at **$1,000–2,000** a year, most commonly $1,000 [secondary,
  stipend-platform data: [Lightspeed guide](https://lighthouse.lsvp.com/resources/learning-development-programs),
  [Compt](https://compt.io/blog/stipend-and-lifestyle-spending-account-benchmarks/)]; named examples
  include Hinge $3,000, Help Scout $1,800, Temporal $1,500 [secondary,
  [Compt examples](https://compt.io/blog/real-world-examples-of-employee-stipends/)].
- Taro says "hundreds" of its members had employer learning budgets pay for it [primary,
  [Taro L&D page](https://www.jointaro.com/learninganddevelopment/taro)].

**For us:** €19–39 is 2–4% of a typical stipend: expensable without an approval conversation.

## 7. Where they gather (distribution)

| Channel | Size | Source |
|---|---|---|
| r/cscareerquestions | ~1.1–2.4M members (trackers disagree) | [secondary, GummySearch](https://gummysearch.com/r/cscareerquestions) |
| r/ExperiencedDevs | ~300–425k | [secondary, GummySearch](https://gummysearch.com/r/ExperiencedDevs) |
| r/leetcode | ~230k | [secondary, GummySearch](https://gummysearch.com/r/leetcode) |
| r/systemdesign | ~100k (unverified) | [secondary, DesignGurus](https://www.designgurus.io/answers/detail/online-communities-for-system-design-interview-preparation-and-advanced-architecture-discussions) |
| ByteByteGo newsletter | 1.35M+ subscribers; ~1.43M YouTube | [primary, ByteByteGo sponsorship page](https://blog.bytebytego.com/p/newsletter-sponsorships-471); [secondary, CreatorDB](https://creatordb.app/creatorstats/bytebytego/) |
| The Pragmatic Engineer | ~1.1M subscribers; $15/month or $150/year paid | [secondary, Reletter](https://reletter.com/publications/the-pragmatic-engineer) |
| Hacker News | A spaced-repetition Show HN reached 140 points (2020); most get under 20 | [secondary, HN](https://news.ycombinator.com/submitted?id=mvind) |

**For us:** the audience is reachable for free through writing and demos. A Show HN is a lottery;
the subreddits and a newsletter mention are the steadier routes.

## Gaps

- Share of engineers who personally pay for ChatGPT Plus or Pro (or a Claude plan), as opposed to
  using a work seat. This drives the SAM and is an **[assumption]** (25%) in
  [sizing-and-pricing.md](sizing-and-pricing.md). Ask it in the week-1 interviews.
- Independent share of loops with a design round.
- Stack Overflow 2025's learning-source breakdown (books, docs, video).
