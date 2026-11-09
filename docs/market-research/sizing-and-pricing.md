# Sizing and pricing

Checked 9 November 2026. Labels: **[primary]**, **[secondary]**, **[assumption]** as in the other
notes. Every assumption here is a number to replace with what the validation weeks measure.

## Takeaway

The theoretical market is large (about €1.9B a year if every developer using AI coding tools paid
€80), the serviceable one is about €96M, and what this team can realistically reach in two years
is **€0.05–0.5M a year**. Comparable developer-learning businesses run by small teams sit at
**$1–6M**. Price under the interview-prep band ($89–$373 a year), in the shapes this market already
buys (one-off, lifetime, fixed-length), because AI subscription apps lose most monthly subscribers
within a year.

---

## 1. Market size (top-down, with every step shown)

| Step | Figure | Running total | Basis |
|---|---|---|---|
| Professional developers | 36.5M | 36.5M | [secondary, SlashData, early 2025](https://slashdata.co/post/global-developer-population-trends-2025-how-many-developers-are-there) |
| … who use AI coding assistants or agents | 65.9% | **24.1M = TAM (people)** | [secondary, Stack Overflow 2026](https://itbrief.co.uk/story/stack-overflow-survey-shows-developers-trust-ai-with-caveats) |
| … with a personal Plus/Pro plan an app may use | 25% | 6.0M | **[assumption]**; ask in week-1 interviews |
| … in a study campaign this year (interview, promotion, new field) | 20% | **1.2M = SAM (people)** | **[assumption]**; 69% learned a new technology last year [secondary], so 20% for a *deep* campaign is conservative |
| … reached through free channels in two years | 2–5% | 24k–60k | **[assumption]** |
| … who pay | 3–8% | **720–4,800 = SOM (people)** | **[assumption]**; AI apps' median trial-to-paid is 8.5% [secondary, RevenueCat], a different metric |

| | People | × €80/year |
|---|---|---|
| TAM | 24.1M | ~€1.9B |
| SAM | 1.2M | ~€96M |
| SOM (two years) | 720–4,800 | **~€0.06–0.38M** (€0.05–0.5M across the price range €60–100) |

## 2. Comparables (bottom-up by analogy)

| Business | What it is | Size | Source |
|---|---|---|---|
| Boot.dev | Gamified backend courses, bootstrapped | $1.3M revenue 2024 (Latka) or $5.7M (another tracker); 25k+ paying claimed | [secondary, Latka](https://getlatka.com/companies/boot.dev/funding); [secondary](https://onepage-research.sliplane.app/products/boot-dev) |
| Taro | Career-growth community for engineers | 1,250 paying members, end of 2023 | [primary](https://blog.jointaro.com/taros-2023-year-in-review) |
| Hello Interview | System-design and interview prep with AI tutor | ~$5.9M raised, 11–51 staff | [secondary, Seedtable](https://prod.actual.seedtable.com/startups/hello-hinterview) |
| ByteByteGo | Author-led newsletter, courses, sponsorships | 1.35M+ subscribers | [primary](https://blog.bytebytego.com/p/newsletter-sponsorships-471) |
| The Pragmatic Engineer | Paid newsletter | ~1.1M subscribers; $150/year | [secondary](https://reletter.com/publications/the-pragmatic-engineer) |
| Coursera + Udemy | Course marketplace, merged May 2026 | ~$1.5B combined revenue reported | [secondary](https://www.panabee.com/news/coursera-completes-udemy-combination-1-5-billion-combined-revenue-and-115-million-synerg) |

**Read across:** focused developer-learning businesses with small teams reach $1–6M. Reaching
Boot.dev's lower estimate would take ~16,000 people paying €80 a year.

## 3. Retention: why not a plain monthly subscription

- RevenueCat 2026 (115,000+ apps): AI apps keep **21.1%** of annual subscribers after a year
  (30.7% for apps without AI) and **6.1%** of monthly ones (9.5%); AI apps convert trials better
  (8.5% vs 5.6%) [secondary,
  [PPC Land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/),
  [TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)].
- RevenueCat's own follow-up says **Education leans towards high retention** among AI apps, because
  the use becomes a habit [primary,
  [RevenueCat](https://www.revenuecat.com/blog/growth/ai-app-retention-study)].
- The paid rivals already avoid open-ended monthly plans: Hello Interview lifetime $299, NeetCode
  lifetime $297, DesignGurus one-off roadmaps $331–345 [primary, pricing pages].

**For us:** sell what has an end (a campaign) or what is owned (a book pack). Renewal is the next
book or the next interview, not a forever plan.

## 4. Price anchors

| Anchor | Price | Source |
|---|---|---|
| Hello Interview | $47 a month, $89 a year, $299 lifetime | [primary](https://www.hellointerview.com/pricing) |
| NeetCode Pro | $119 a year, $297 lifetime | [primary](https://neetcode.io/pro) |
| LeetCode Premium | $35 a month, $159 a year | [secondary](https://prachub.com/resources/leetcode-pricing) |
| Aced (Exponent) | $79 a month, $149 a year | [secondary](https://prachub.com/resources/exponent-vs-hello-interview) |
| DesignGurus | $373 a year; system-design roadmap $345 one-off | [primary](https://www.designgurus.io/pricing) |
| interviewing.io | ~$179 per human mock | [secondary](https://www.noon.ai/blog/articles/441-interviewing-io-pricing-2026) |
| O'Reilly | $499 a year | [secondary](https://dev.to/royce_fabbd83cb268312e928/oreilly-learning-platform-review-2026-pricing-and-value-2oab) |
| Execute Program | $39 a month | [secondary](https://code.brettchalupa.com/execute-program-review) |
| RemNote Pro with AI | $18 a month (billed yearly) | [secondary](https://costbench.com/software/note-taking/remnote/) |
| A typical learning stipend | $1,000–2,000 a year | [secondary](https://lighthouse.lsvp.com/resources/learning-development-programs) |
| ChatGPT Plus (already paid) | ~$20 a month | |

## 5. The offers to test

| Offer | What | Price | Logic |
|---|---|---|---|
| **A. Book pack** | One book's checked figures, concept graph, question banks; updates for its edition; works with the reader's own copy | **€19 one-off** | A fraction of the book's own price (a Manning title lists at $69.99 [secondary](https://massivebookshop.com/products/9781633434882)); owned, so no churn |
| **B. Campaign** | All packs, sync, phone review, "explain the design" sessions, for three months | **€39** | Below Hello Interview's single month ($47); ends when the interview does |
| Later: **Team** | Shared packs for internal docs, the vault as agents' context | per seat | Learning budgets: $1,254 per employee [primary, ATD] |

**Week-4 test:** split the waitlist; half see A, half see B, as pre-orders. Pass: ≥5% of the
waitlist pays. Also learn which *shape* this customer buys: ownership of a book layer, or access for
a campaign.

## 6. Unit economics (per paying user, first year)

| Line | A (€19 pack) | B (€39 campaign) | Basis |
|---|---|---|---|
| Revenue | €19 | €39 | |
| Payment fees (~3% + €0.25) | ~€0.80 | ~€1.40 | **[assumption]**, typical card processor |
| Model inference | €0 | €0 | The user's own plan |
| Sync storage and bandwidth | ~€0 | ~€0.50 | **[assumption]**; text files and small figures |
| Pack production, amortised | ~€1–4 | ~€1–4 | **[assumption]**: ~40 reviewer hours per book at €25/hour = €1,000, over 250–1,000 buyers |
| **Gross margin** | **~75–95%** | **~85–95%** | A software margin, because we host no model |

The binding cost is people: pack review, support, and the author relationships, not compute.

## 7. What would change the size

- **Up:** a partnered DDIA pack (the most recommended system-design book, new edition in 2026);
  an employer channel (onboarding packs per company); a free Gemini route for people without a
  paid plan.
- **Down:** OpenAI declining paid apps' plan usage; Hello Interview or a publisher shipping
  explain-back with review; week-3 return below 15%.

## Gaps

- The share of engineers with a *personal* Plus or Pro plan (the biggest assumption).
- Real conversion from a developer-tool waitlist to a paid pre-order.
- Pack production time: measure it on the first open pack.
