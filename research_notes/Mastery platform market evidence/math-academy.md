# Math Academy (mathacademy.com)

Research cut-off: 26 October 2026. Unless stated otherwise, "checked" means the page was fetched on that date. Company claims are labelled as such; independent observation and third-party estimates are labelled separately.

## Product and pedagogy: knowledge graph size and granularity, diagnostic, fractional completion, implicit repetition, mastery thresholds, human vs generated content

### Takeaway

Math Academy is a hand-built, expert-authored prerequisite graph of roughly 2,500 topics (each split into 3–4 "knowledge points"), served by a spaced-repetition engine (FIRe — Fractional Implicit Repetition) that gives partial credit for reviewing sub-skills implicitly, and gated by mastery thresholds the company claims produce 93–98% first/second-attempt lesson pass rates. The pedagogy is deliberately an "expert system, not machine learning": almost nothing is LLM-generated, and the differentiation is the graph's granularity plus a decade of item-level response data, not model intelligence.

### Cited Findings

- **Graph size:** "about 2,500 topics" spanning 4th grade to university, as of November 2024; each topic contains "3–4 knowledge points", and each knowledge point is linked to several prerequisite knowledge points with hand-assigned "encompassing weights" — [Justin Skycak, "How Math Academy Creates Its Knowledge Graph", 13 Nov 2024](https://www.justinmath.com/how-math-academy-creates-its-knowledge-graph/)
- **Human-authored, not generated:** "All of our content, metadata, and exercises are created in-house … by a team of math experts"; the first full "encompassing" pass over the graph took roughly 250 hours of expert data entry and covered ~1,500 topics at that time — [Justin Skycak, 13 Nov 2024](https://www.justinmath.com/how-math-academy-creates-its-knowledge-graph/)
- **Granularity claim:** a calculus course is ~300 topics × ~3 knowledge points ≈ 1,000 discrete learning steps, described as "10x more finely scaffolded" than a textbook chapter structure — [mathacademy.com/pedagogy](https://mathacademy.com/pedagogy)
- **Diagnostic design:** the placement diagnostic is adaptive and targets the student's "knowledge frontier"; it prunes a candidate pool of 500–1,000 topics and is claimed to cut the number of questions by an order of magnitude versus a linear test; topics can be marked "conditionally completed" and the diagnostic walks backwards when a student struggles — [mathacademy.com/how-our-ai-works](https://mathacademy.com/how-our-ai-works)
- **FIRe (Fractional Implicit Repetition):** when a student reviews a high-level skill, repetition credit "trickles down" fractionally to the sub-skills it encompasses, so sub-skills are maintained without being scheduled individually; Skycak presents FIRe as his own invention, alongside "repetition compression", interleaving, "layering" and anti-interference scheduling — [mathacademy.com/pedagogy](https://mathacademy.com/pedagogy); [Justin Skycak bio/books](https://www.justinmath.com/)
- **Per-student, per-topic pacing:** learning speed is modelled per student per topic and can vary from 0.5x to 2x baseline; timed quizzes appear roughly every 150 XP and quiz difficulty is tuned so the target score is ~80% — [mathacademy.com/pedagogy](https://mathacademy.com/pedagogy)
- **Mastery thresholds (company claim):** lessons are passed on the first attempt 93% of the time and by the second attempt 98% of the time — [mathacademy.com/faq](https://mathacademy.com/faq); a stronger version, ">95% first attempt, >99% within two", was stated on the AEI podcast — [AEI, "Math Academy with Jason Roberts and Justin Skycak", 14 Jan 2026](https://www.aei.org/podcast/math-academy-with-jason-roberts-and-justin-skycak/)
- **Guardrails against guessing:** a lesson is halted after too many misses, and guessing wrong carries negative XP — [mathacademy.com/pedagogy](https://mathacademy.com/pedagogy)
- **Time accounting:** 1 XP ≈ 1 minute of focused effort; the recommended dose is 20–40 XP/day, 3–5 days/week; AP Calculus BC is quoted at ~6,000 XP versus ~24,000 minutes in a traditional school year, which is the arithmetic behind the "4x faster" headline — [mathacademy.com](https://mathacademy.com/); [mathacademy.com/pedagogy](https://mathacademy.com/pedagogy)
- **Outcome claim at course level:** the 4th-grade course reportedly had 93% of students master every topic — Alex Smith (Curriculum Director) comment reported 2025, cited in [Justin Skycak, "Math Academy Success Stories", 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/)
- **Independent description of the lesson format (critical):** a lesson is an intro, a worked example, then 2–5 multiple-choice questions; "explanations are optional" because a student can skip straight to the questions; the probability course is ~180 topics × 2–3 skills — [Michael Pershan, "Math Academy Wants To Supercharge Your Learning", 6 Feb 2025](https://pershmail.substack.com/p/math-academy-wants-to-supercharge)
- **Independent description of the graph's honesty (critical):** "the DAG is a lie" — the prerequisite graph is presented as precise but the diagnostic infers conceptual understanding poorly, and the engine forces remedial sequences a knowledgeable student does not need — [Oz Nova, "A Balanced Review of Math Academy", 10 Apr 2025](https://newsletter.ozwrites.com/p/a-balanced-review-of-math-academy)
- **Course catalogue (checked 26 Oct 2026):** 4th–8th grade math, Prealgebra, Algebra I/II, Geometry, Precalculus, Integrated Math I–III (plus Honors), SAT Math Fundamentals and Prep, ACT, AP Calculus AB/BC, Mathematical Foundations I–III (adult track, ~15,000 minutes), Calculus I/II, Linear Algebra, Multivariable Calculus, Methods of Proof, Differential Equations, Discrete Math, Probability & Statistics, Math for Machine Learning, Math Methods for Physical Sciences I/II; Abstract Algebra in development — [mathacademy.com](https://mathacademy.com/); [mathacademy.com/how-our-ai-works](https://mathacademy.com/how-our-ai-works)
- **2025–26 additions:** Discrete Math, 115 previously "missing middle" SAT topics, and "tens of thousands" of free-response questions were added in 2025; the Math for Machine Learning course's coding projects were still unreleased as of January 2026 — [Justin Skycak, "Math Academy Success Stories", 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/); [dgore, "My Review of Math Academy", 12 Jan 2026](https://drgore.substack.com/p/my-review-of-math-academy)

### Inferences

- The defensible asset is _authored structure plus response data_, not algorithms: 2,500 hand-specified topics with hand-tuned prerequisite weights and ~250 expert-hours per graph pass is a slow, capital-light but time-heavy moat that a competitor cannot copy by prompting a model.
- Because learning speed is modelled per student per topic, the product's real differentiator versus a textbook is scheduling (what to review, when, and how much), not explanation quality — which is exactly the axis critics attack.
- The "4x" figure is an accounting identity (XP minutes vs allocated school minutes), not a measured effect size; it should be treated as a marketing framing rather than an outcome.
- Fractional implicit repetition is genuinely unusual in consumer edtech and is the mechanism that lets a graph this large stay reviewable inside ~30 minutes a day; it is the single most transferable idea for any mastery-based product.
- The absence of a "I don't know" affordance and the forced multiple-choice format are design choices that buy throughput at the cost of diagnostic and explanatory depth (see the Evidence section).

### Gaps

- No public figure for the _current_ number of knowledge points (as opposed to topics), nor for the current item bank size; the 2,500-topic figure is from Nov 2024 and may be stale.
- No published specification of the mastery threshold itself (e.g. required score on a lesson quiz before a topic counts as mastered); the company describes targeting ~80% quiz scores but does not publish the pass rule.
- No independent audit of the knowledge graph's correctness; both the topic count and the prerequisite weights rest on company statements.
- Could not verify the claim that content is 100% human-authored; that claim is from the company and there is no third-party inspection.

## Pricing and packaging: exact and current consumer, annual, trial, school and family terms

### Takeaway

Consumer pricing is a single, undiscounted $49/month per student, with no free trial, no sibling or family discount, and no regional or purchasing-power pricing; a cheaper annual plan exists (≈$499–500/year, roughly 15% off) but its exact price is not published on any live page as of October 2026. Schools and universities are quoted individually by invoice, with no public per-seat rate.

### Cited Findings

- **Headline consumer price:** "Only $49/mo per student" — [mathacademy.com](https://mathacademy.com/), checked 26 Oct 2026; identical wording in the [Wayback Machine snapshot of 30 Jul 2026](https://web.archive.org/web/2026*/mathacademy.com)
- **Per-student, not per-family:** pricing is explicitly per student, so a household with two children pays $98/month — [mathacademy.com/faq](https://mathacademy.com/faq)
- **Annual plan:** "$499/year (26x cheaper [than a tutor])" — Justin Skycak, Hacker News comment, 4 Aug 2024, via [his HN comment history](https://news.ycombinator.com/threads?id=justinskycak); "$500 USD annually" — [biggo.com, "Math Academy's $49 Monthly Price Sparks Heated Debate", 15 Aug 2025](https://biggo.com/news/202508150714_Math_Academy_Price_Debate); "$49/month, as of October 8, 2026" — [skipschool.ai review](https://skipschool.ai/review-math-academy); "you can get the yearly plan at a discount … I personally bought the yearly plan" — [madisonkanna.substack.com, 16 Nov 2025](https://madisonkanna.substack.com/p/my-honest-review-of-math-academy)
- **No free trial:** stated explicitly in the FAQ — [mathacademy.com/faq](https://mathacademy.com/faq)
- **Refund:** 30-day full refund — [mathacademy.com/faq](https://mathacademy.com/faq)
- **Pausing:** subscriptions can be paused for 30–90 days — [mathacademy.com/faq](https://mathacademy.com/faq)
- **No discounts of any kind:** no sibling/family discount, no purchasing-power or regional pricing, no promotional codes — [mathacademy.com/faq](https://mathacademy.com/faq)
- **Payment rails:** credit card via Stripe; no PayPal; purchase orders accepted from charter homeschool networks (named examples: The Cottonwood School, Sky Mountain Charter School, Suncoast Preparatory Academy) — [mathacademy.com/faq](https://mathacademy.com/faq)
- **Schools:** no published per-seat rate; onboarding is hand-held and invoiced, and the company was "intentionally growing without a sales team" — Jason Roberts, Math Academy Podcast #7 Part 2, 19 Feb 2026 (transcript archived locally); [Math Academy Podcast index](https://www.justinmath.com/podcasts/)
- **University pricing (anecdote, not a rate card):** a liberal-arts college professor had students pay per term for Calculus 2; Roberts judged the model viable only because the per-term cost stayed under roughly $100–150 per quarter — Jason Roberts, Math Academy Podcast #7 Part 2, 19 Feb 2026
- **Currency:** USD only; no localised pricing observed on any live page — [mathacademy.com](https://mathacademy.com/)
- **Scholarships:** no scholarship or financial-aid programme is described in the FAQ or on the pricing surface — [mathacademy.com/faq](https://mathacademy.com/faq)
- **Comparison anchor used by the company:** a human tutor at $50/hour, 5 days/week, 52 weeks ≈ $13,000/year, making the product "26x cheaper" — [Justin Skycak, "Math Academy Success Stories", 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/); the same framing appears in [biggo's coverage, 15 Aug 2025](https://biggo.com/news/202508150714_Math_Academy_Price_Debate)
- **Price is the most contested attribute:** the $49/month figure is the stated cause of the community argument over value versus free alternatives — [biggo.com, 15 Aug 2025](https://biggo.com/news/202508150714_Math_Academy_Price_Debate)

### Inferences

- The packaging is deliberately austere: one SKU, no trial, no discounts. That is only sustainable with strong word-of-mouth conversion, and it means the company is choosing margin and simplicity over funnel width — the opposite of typical consumer-subscription playbooks.
- $499/yr against $588/yr monthly is a ~15% discount, i.e. two months free; nothing suggests a multi-year or lifetime tier.
- A $49/month price with no family tier puts the product structurally out of reach for most large families and for non-US buyers, which matches the observed skew toward motivated, math-strong, often homeschool households.
- Because there is no free trial, the 30-day refund is effectively the trial; that shifts the burden of proof onto the first month of use, which favours confident, well-supported parents.
- Per-student university seats at <$150/quarter is roughly the ceiling the company believes an individual student will pay out of pocket — a useful reference point for any per-learner pricing in adjacent products.

### Gaps

- The exact current annual price (and whether it has changed since 2024) could not be confirmed: no live page states it, and the only figures found are a 2024 company comment ($499) and 2025 third-party reports ($500).
- No public school, district or university per-seat rate, minimum seat count, or contract length.
- No information on whether a sibling/family plan is planned or was ever trialled.
- No scholarship, Title I, or low-income programme found; cannot confirm one does not exist privately.
- Unclear whether the price includes the proctored-exam service the company said it was building.

## Scale and business: users, revenue signals, funding, team, growth, school adoption, international footprint

### Takeaway

Math Academy is a self-funded, profitable, deliberately tiny company with no outside investment and no paid advertising, founded by a husband-and-wife team and grown almost entirely by word of mouth. Public user, revenue and headcount figures do not exist from the company; the only numbers are unreliable aggregator estimates that contradict each other and contradict the company's own description of its size.

### Cited Findings

- **Ownership and funding:** self-funded, no outside investment, no paid advertising, profitable — Jason Roberts, Math Academy Podcast #7 Part 2, 19 Feb 2026 (transcript); corroborated by the "no sales team" framing in [Math Academy Podcast #9, Jun 2026](https://www.justinmath.com/podcasts/)
- **Entity and founders:** Math Academy, LLC; founders Jason Roberts and Sandy Durell Roberts, a Pasadena couple who began teaching advanced math to a handful of local students including their son in 2013 — [Pasadena Now, "Created by Pasadena Couple, America's 'Most Advanced' Math Learning Program Goes Global"](https://pasadenanow.com/main/created-by-pasadena-couple-americas-most-advanced-math-learning-program-goes-global); [Pasadena Educational Foundation](https://pasedfoundation.org/our-work/in-the-classroom/math-academy/)
- **Timeline:** in-school programme running since 2013–14; PUSD pilot 2016–17; software development began summer 2019; first paying online customer August 2021; website publicly launched autumn 2021 — [mathacademy.com/about-us](https://mathacademy.com/about-us); [reddit r/homeschool thread](https://www.reddit.com/r/homeschool/comments/16hn9f5/math_academy_mathacademycom_experiences/)
- **Growth marker:** the company "grew to hundreds of commercial users and hit operating break-even" in 2022–23 — [Justin Skycak, "Math Academy Success Stories", 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/)
- **Team size:** genuinely small and remote; Sandy Roberts personally handles all customer support; Jason Roberts works seven days a week; hiring is described as difficult — Jason Roberts, Math Academy Podcast #7 Part 2, 19 Feb 2026
- **Schools growth:** roughly 1 to ~10 school customers over ~1.5 years, each set up manually, with self-serve onboarding being built; podcast #9 (Jun 2026) reports a "huge increase in the number of schools" for the coming academic year — [Math Academy Podcast #9](https://www.justinmath.com/podcasts/); [Math Academy Podcast #7 Part 2](https://www.justinmath.com/podcasts/)
- **First university customer:** a liberal-arts college using it for Calculus 2 in 2026 — Jason Roberts, Math Academy Podcast #7 Part 2, 19 Feb 2026
- **In-school programme scale:** "over 180 students across all grade levels and school campuses" in the PUSD-linked programme, with a stated goal of eventually graduating 50 students per year — [mathacademy.us/faq](https://www.mathacademy.us/faq) (this is the separate nonprofit in-school arm, branded "Online Beta", fiscally sponsored by the Pasadena Community Foundation — [mathacademy.us](https://www.mathacademy.us/))
- **Headline adoption claim:** Joe Liemandt's Alpha School uses Math Academy as the primary 4th–12th grade math curriculum and publicly credits it for their math results (Liemandt posts Nov 2025 – Mar 2026) — cited in [Justin Skycak, "Math Academy Success Stories", 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/); note this is a company-amplified citation of a third party, not independent verification
- **Accreditation and articulation:** WASC-accredited; listed in the University of California Directory of Online Publishers; issues transcripts and grades — [mathacademy.com](https://mathacademy.com/); [skipschool.ai review, Oct 2026](https://skipschool.ai/review-math-academy)
- **Revenue estimates (unreliable):** compworth estimates "$9.9M revenue, team of around 60+ employees" — [compworth.com company page](https://compworth.com/company/math-academy) (page returns 403 on direct fetch; content seen only through search snippets); RocketReach states "annual revenue was $5.9 million in 2026" — [rocketreach.co](https://rocketreach.co/math-academy-management_b73dfe4bc7fd5904); Tracxn states "latest employee count … is 40" as of 1 Jul 2024 — [tracxn.com](https://tracxn.com/d/companies/math-academy/__fvWQNvJtC7a-zp_bA8f5owgJMR2wjO6JBalb3obn9XE)
- **International:** content is US-curriculum-shaped (Common Core sequencing, SAT, ACT, AP), and no localised curriculum or pricing exists; international users are served by the same USD product — [mathacademy.com](https://mathacademy.com/); [mathacademy.com/faq](https://mathacademy.com/faq)

### Inferences

- The three aggregator estimates cannot all be true and at least two are wrong: $9.9M revenue with 60+ staff is inconsistent with a company where the co-founder answers all support email and no one is on a sales team; $5.9M with 40 staff is equally hard to reconcile. Treat all three as scraped guesses, not data.
- If one takes the revenue estimates at face value as a sanity check only: at $49/month, $5.9M implies ~10,000 monthly-equivalent subscribers and $9.9M implies ~17,000 — both plausible orders of magnitude for a profitable niche product with no ad spend, but neither is verifiable.
- "Hundreds of commercial users" (2022–23) to a low-five-figure subscriber base (implied) in ~3 years is consistent with a compounding word-of-mouth curve rather than a growth-marketing curve.
- Growth is currently constrained by operations, not demand: manual school setup, no sales team, one person on support, and a founder working seven days a week are the binding constraints, which is why self-serve school onboarding and proctored exams are the stated roadmap.
- The PUSD in-school programme (~180 students) is not a commercial channel; it is a nonprofit proof ground. Its small size should not be read as a ceiling on the commercial business.
- Alpha School is the most valuable single reference account available to Math Academy, which explains why the company amplifies it — and why an independent observer should discount it accordingly.

### Gaps

- No company-disclosed user count, paying-subscriber count, ARR, or valuation for any period, let alone 2025–26. The only first-party scale datum is "hundreds of commercial users" in 2022–23.
- No verifiable employee count; the 40 and 60+ figures are contradictory aggregator estimates.
- No public list of school or district customers beyond the three charter networks named in the FAQ and Alpha School.
- No data on churn, retention, or average subscription length — the most important missing number for judging whether a no-trial, no-discount model actually works.
- No information on international user share, though the product is structurally US-centric.
- The Alpha School relationship's commercial terms (paid licence vs pilot vs in-kind) are unknown.

## Who the buyer is: parent, student or school; the purchase story; weekly time; parent involvement

### Takeaway

The buyer is overwhelmingly a parent — typically a homeschooler or the parent of a math-strong, accelerating child — who pays $49/month out of pocket, sets a daily XP target, and monitors progress through a separate oversight account. Adults buying for themselves are a substantial second segment the company acknowledges publicly; schools and professors are a small, fast-growing third segment that the company is only now learning to sell to.

### Cited Findings

- **Parents as the core buyer:** the marketing surface is addressed to parents ("per student", parent oversight account, daily/weekly progress notifications, parental goal-setting) — [mathacademy.com](https://mathacademy.com/); [mathacademy.com/faq](https://mathacademy.com/faq)
- **Homeschool skew:** homeschool families are the most visible review constituency, with multi-year usage logs in homeschool forums — [Well-Trained Mind forum, "My Ongoing Review of MathAcademy.com", updated 18 Jul 2024](https://forums.welltrainedmind.com/topic/733445-my-ongoing-review-of-mathacademycom-updated-71824/); [skipschool.ai review for homeschool families, Oct 2026](https://skipschool.ai/review-math-academy)
- **Adults as a real segment:** "many of Math Academy's users are adults" — [AEI, "Math Academy with Jason Roberts and Justin Skycak", 14 Jan 2026](https://www.aei.org/podcast/math-academy-with-jason-roberts-and-justin-skycak/); the adult track (Mathematical Foundations I–III, ~15,000 minutes) exists specifically for them — [mathacademy.com](https://mathacademy.com/)
- **Adult self-buyer reviews:** [dgore, "My Review of Math Academy", 12 Jan 2026](https://drgore.substack.com/p/my-review-of-math-academy); [understandtutor.com, "Math Academy review for adults", 3 Oct 2026](https://understandtutor.com/blog/math-academy-review-for-adults); [madisonkanna.substack.com, 16 Nov 2025](https://madisonkanna.substack.com/p/my-honest-review-of-math-academy)
- **The canonical customer story:** a 5th grader, Stephen Huffaker, completed roughly seven years of math in about 1.5 years and scored 5 on AP Calculus BC; in 2026 a 3rd grader also scored 5 on AP Calculus BC — [Justin Skycak, "Math Academy Success Stories", 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/)
- **Other marketed stories:** 6th grade to calculus in under a year; "two years ahead"; 8th graders passing AP Calculus BC; adults rebuilding confidence — [Justin Skycak, "Math Academy Success Stories", 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/)
- **Weekly time commitment:** 20–40 XP/day at ~1 XP/minute, 3–5 days/week — [mathacademy.com](https://mathacademy.com/); "one hour per weekday is the upper end of sustainable" — [AEI podcast, 14 Jan 2026](https://www.aei.org/podcast/math-academy-with-jason-roberts-and-justin-skycak/); an adult user independently converged on ~1 hour/day — [dgore, 12 Jan 2026](https://drgore.substack.com/p/my-review-of-math-academy)
- **Parent involvement is designed in and warned about:** parents set XP goals and receive notifications, and the company explicitly warns against "overhelping" — [mathacademy.com/faq](https://mathacademy.com/faq)
- **Schools as buyer:** ~10 school customers, manual onboarding; a "huge increase" expected for 2026–27 — [Math Academy Podcast #9, Jun 2026](https://www.justinmath.com/podcasts/)
- **Professors as buyer:** a liberal-arts college professor assigned it for Calculus 2 with students paying per term — Jason Roberts, Math Academy Podcast #7 Part 2, 19 Feb 2026
- **The company refuses to niche to homeschool:** Roberts states explicitly that Math Academy is not pitched only at homeschoolers — Math Academy Podcast #7 Part 2, 19 Feb 2026

### Inferences

- The purchase is parent-led but student-executed, which puts the real product risk in week 3–6: a parent who has paid $49 and set an XP goal, and a child who resents being timed. The company's own "overhelping" warning is an acknowledgement of this failure mode.
- The buyer's job-to-be-done is acceleration or remediation relative to a school system, not "learn math for its own sake". That makes the product's natural market the family already dissatisfied with their school's math track.
- Adults are a strategically important segment because they buy for themselves, tolerate the austere UX, and do not need parent dashboards — but they also churn faster once the immediate goal (interview prep, degree requirement) is met.
- The school segment requires an entirely different sales motion (invoices, purchase orders, proctoring, rostering), which is why growth there is gated on self-serve onboarding rather than demand.
- A product centred on books and figures sits adjacently, not competitively: the Math Academy buyer wants a scheduler and a problem supply, and is likely to keep a book alongside it (Oz Nova recommends exactly that).

### Gaps

- No published split between parent-bought, adult-self-bought, and school-bought revenue.
- No demographic data on buyers (country, income, education, household size) and no churn-by-segment data.
- No data on how many families run multiple students, despite per-student pricing making that the obvious expansion lever.
- No information on how school districts (as opposed to individual schools or charters) procure it, or whether any district-level contract exists.

## Evidence: outcome data, test results, independent reviews, credible criticisms, and the gap between marketing and proof

### Takeaway

There is no peer-reviewed or independently conducted outcome study. The evidence base is a mix of in-school AP score results, company-published case studies and statistics, and a set of unusually substantive critical reviews from experienced math teachers and learners. The critics do not dispute that the product builds procedural fluency; they dispute that it builds understanding, and they argue the marketing conflates the two.

### Cited Findings

- **No independent study found:** no peer-reviewed evaluation, randomised trial, or third-party efficacy study of mathacademy.com was located across company pages, press coverage, and review literature (searched 26 Oct 2026)
- **Company outcome evidence:** AP Calculus results from the PUSD in-school programme, plus case studies (7 years of math in 1.5 years; 8th-grade AP Calculus BC passes; a 2026 3rd grader with a 5) — [Justin Skycak, "Math Academy Success Stories", 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/)
- **Company statistics:** 93% first-attempt and 98% second-attempt lesson pass rates — [mathacademy.com/faq](https://mathacademy.com/faq); 93% of students mastering every topic in the 4th-grade course — [Success Stories, 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/)
- **Pershan's critique (teacher, paid subscriber):** lessons are intro + worked example + 2–5 multiple-choice questions; "explanations are optional"; the design optimises for "never forget" over "understand"; his verdict on the approach to understanding is that it is "fundamentally broken and I don't think it can be fixed"; he paid "$50" to evaluate it — [Michael Pershan, "Math Academy Wants To Supercharge Your Learning", 6 Feb 2025](https://pershmail.substack.com/p/math-academy-wants-to-supercharge)
- **Oz Nova's critique (experienced learner):** strong for procedural fluency and test prep, weak for conceptual understanding; "the DAG is a lie"; the diagnostic misjudges understanding and forces unnecessary remediation; recommends a textbook as the core and Math Academy as a "digital Schaum's Outline" — [Oz Nova, "A Balanced Review of Math Academy", 10 Apr 2025](https://newsletter.ozwrites.com/p/a-balanced-review-of-math-academy)
- **Dan Meyer's critique:** framed as "It Is Fun to Pretend That Hard Things Are Easy!" — the argument that the product's promise of speed removes the productive struggle that constitutes mathematical learning — [danmeyer.substack.com](https://danmeyer.substack.com/) (title and author confirmed; exact post permalink not retrieved)
- **Student-reported attrition and stress:** "The dropout rate is absolutely ridiculous and the stress it puts on students is just unparalleled," said one student who left after 8th grade; students reported surface-level coverage, resentment of XP and negative XP, no college credit, and teachers conceding the high-school curriculum was not yet established — [Pasadena Chronicle, "Math Academy, A Decade Later", May 2023](https://pasadenachronicle.org/2023/may/math-academy-a-decade-later) (the same quote is reproduced in [Pershan, 6 Feb 2025](https://pershmail.substack.com/p/math-academy-wants-to-supercharge))
- **Positive but qualified independent reports:** an experience report from a middle-school-aged learner's parent over one month — [LessWrong, "My First Month with Math Academy", 1 Jun 2025](https://www.lesswrong.com/posts/HxtYuHpa3jzrWsrdm/my-first-month-with-math-academy-an-experience-report-from-a); a 500-day adult review noting no "I don't know" button, slow re-diagnosis, no video or interactive figures, and a delayed ML course — [dgore, 12 Jan 2026](https://drgore.substack.com/p/my-review-of-math-academy); a self-taught math-heavy user's review of strengths and annoyances — [nor's blog, 16 Apr 2025](https://nor-blog.pages.dev/posts/2025-04-16-mathacademy/)
- **Homeschool parent log (positive, longitudinal):** a parent documents a student learning more calculus in one month of Math Academy than expected, versus prior Derek Owens coursework — [Well-Trained Mind forum, updated 18 Jul 2024](https://forums.welltrainedmind.com/topic/733445-my-ongoing-review-of-mathacademycom-updated-71824/)
- **Price/value as the dominant community criticism:** the 500-day review triggered a large argument specifically about $49/month versus free alternatives — [biggo.com, 15 Aug 2025](https://biggo.com/news/202508150714_Math_Academy_Price_Debate)
- **Data portability criticism:** a parent built a browser extension to extract their own child's data because no export exists — Hacker News discussion, 9 Oct 2025 (thread located via [HN search](https://hn.algolia.com/?q=math+academy))
- **Accreditation as a partial external check:** WASC accreditation and UC Directory of Online Publishers listing are third-party validations of institutional quality, not of learning efficacy — [mathacademy.com](https://mathacademy.com/); [skipschool.ai, Oct 2026](https://skipschool.ai/review-math-academy)

### Inferences

- The strongest available evidence is convergent testimony from knowledgeable users that procedural fluency and test performance improve, plus the company's own pass-rate statistics; the weakest link is any claim about conceptual transfer.
- Pershan's and Nova's critiques are consistent with each other and with the product's stated design (throughput, interleaving, multiple-choice), which makes them credible rather than hostile: the company is not accused of failing at its own goals, but of having goals that are too narrow.
- The Pasadena Chronicle piece is the only source describing attrition, and it concerns the in-school programme circa 2023 rather than the commercial product; it should not be generalised to consumer subscribers, but it is the only attrition signal that exists.
- Company statistics (93%/98% pass rates) measure _lesson_ success, not learning; they are conditioned on the engine choosing the next item, so they partly measure the scheduler's calibration. They should never be quoted as an efficacy effect size.
- Absence of an independent RCT after five years of commercial operation is itself a finding: the company competes on word-of-mouth and accreditation, not on published research, and that is a vulnerability any honest competitor can name.

### Gaps

- No independent, peer-reviewed, or third-party efficacy study; no effect size on any standardised measure attributable to Math Academy alone.
- No retention data: no published figure for how many subscribers stay past 3, 6 or 12 months, or for the in-school programme's actual attrition rate (the "ridiculous dropout rate" is a student quote, not a statistic).
- No AP score distributions for the commercial (as opposed to in-school) population, and no denominator for the published AP anecdotes.
- The Dan Meyer post's exact URL was not retrieved; only the title, author and publication are confirmed.
- The Hacker News data-export thread could not be pinned to a specific item ID.

## Competitive and strategic position: the real moat, what it cannot do, LLM stance, expansion beyond math, named analogues

### Takeaway

Math Academy's moat is a hand-authored prerequisite graph plus FIRe plus a decade of item-level data, wrapped in accreditation — not AI, not content volume, not brand reach. Its structural limits are equally clear: math only, no user-supplied material, no local ownership or export, thin visual/interactive explanation, and a US assessment frame. Its stance on LLMs is deliberately conservative, treating them mainly as a cheating risk rather than as a product surface.

### Cited Findings

- **Explicitly not machine learning:** the system is described as an "expert system, not machine learning" — [Scraping Bits podcast #107, Sep 2024](https://www.justinmath.com/podcasts/)
- **Content is not LLM-generated:** all content, metadata and exercises are created in-house by math experts — [Justin Skycak, 13 Nov 2024](https://www.justinmath.com/how-math-academy-creates-its-knowledge-graph/)
- **LLMs framed as a cheating risk:** "assessments must be done in person"; proctored exams are on the roadmap — Math Academy Podcast #6 Part 1, Jan 2026; [Math Academy Podcast #7 Part 2, 19 Feb 2026](https://www.justinmath.com/podcasts/)
- **Skycak's own admission of the gap:** he says he would instruct an LLM to tutor himself in biology precisely because "Math Academy for biology" does not exist — Golden Nuggets podcast #40, Nov 2024
- **Positioning against free/cheap alternatives:** the company benchmarks itself on _learning efficiency_ against Khan Academy, MIT OpenCourseWare and textbooks, and on _cost_ against human tutors (~$13,000/year) — [Justin Skycak, 4 Aug 2026](https://www.justinmath.com/math-academy-success-stories/); [mathacademy.com](https://mathacademy.com/)
- **Community-chosen analogues:** Hacker News and review discussion compares it to Brilliant, Synthesis, Execute Program, Anki (for the spaced-repetition model) and Duolingo (for the XP criticism) — [HN search](https://hn.algolia.com/?q=math+academy); [biggo.com, 15 Aug 2025](https://biggo.com/news/202508150714_Math_Academy_Price_Debate); [nor's blog, 16 Apr 2025](https://nor-blog.pages.dev/posts/2025-04-16-mathacademy/)
- **What it does not do — subjects:** math only; there is no science, humanities or language offering — [mathacademy.com](https://mathacademy.com/)
- **What it does not do — user material:** there is no way to bring your own book, notes or syllabus; the curriculum is fixed — [mathacademy.com/faq](https://mathacademy.com/faq)
- **What it does not do — ownership:** subscription-only, cloud-only, no offline mode, and no data export (hence the third-party browser extension) — Hacker News, 9 Oct 2025, via [HN search](https://hn.algolia.com/?q=math+academy)
- **What it does not do — explanation depth:** lessons are text plus images; "could be better illustrated by video or interactive demonstrations"; there is no "I don't know" option — [dgore, 12 Jan 2026](https://drgore.substack.com/p/my-review-of-math-academy)
- **What it does not do — assessment honesty:** multiple-choice lesson items and no in-product proctoring yet, which is why in-person assessment is the stated fix — [Michael Pershan, 6 Feb 2025](https://pershmail.substack.com/p/math-academy-wants-to-supercharge); [Math Academy Podcast #7 Part 2](https://www.justinmath.com/podcasts/)
- **Expansion vectors named by the company:** a Math for Machine Learning course with coding projects; "Math Academy goes to college" via per-term student-paid seats; self-serve school onboarding; proctored exams — [Math Academy Podcast #7 Part 2, 19 Feb 2026](https://www.justinmath.com/podcasts/); [dgore, 12 Jan 2026](https://drgore.substack.com/p/my-review-of-math-academy)
- **Explicit refusal to niche:** Roberts rejects positioning as a homeschool-only product — Math Academy Podcast #7 Part 2, 19 Feb 2026
- **Demand signal outside its market:** the recurring "can I use this for physics/CS/biology" question and Skycak's own biology remark indicate demand for the _method_ well beyond the subject it serves — [HN search](https://hn.algolia.com/?q=math+academy)

### Inferences

- The moat is real but narrow and time-based, not technology-based: a competitor with a model can generate 2,500 topics in a week, but cannot generate the hand-tuned encompassing weights or the item-level response history that makes FIRe's fractional credit meaningful.
- Accreditation (WASC, UC a-g listing) is an underappreciated part of the moat: it converts a study tool into something a school can put on a transcript, which is exactly the barrier an AI-native competitor will hit.
- The LLM stance is a coherent strategic bet — that structured practice, not explanation, is the scarce good — but it leaves the entire "explain it to me" surface to competitors, which is where Pershan's and Nova's criticisms land.
- The clearest strategic opening against Math Academy is therefore not "cheaper practice" but "practice plus real understanding plus your own books" — the exact combination it structurally cannot offer.
- Its inability to accept user-supplied material, export data, or work offline is a values gap, not a technical one; a local-first, file-owned product can claim the opposite position credibly and without needing to match the graph's granularity on day one.
- Expansion into college and into ML/CS is a search for higher willingness-to-pay and lower parental-involvement burden; both move it away from the homeschool core and toward institutions, where its no-sales-team model is weakest.

### Gaps

- No public roadmap with dates for proctored exams, school self-serve onboarding, or the ML course's coding projects.
- No evidence of any subject expansion beyond math, and no stated intention to add one.
- The Golden Nuggets #40 and Scraping Bits #107 citations rest on the podcast index and episode descriptions rather than full transcripts; the exact wording of the biology remark should be re-verified before quotation.
- No competitive analysis from the company's side beyond efficiency comparisons with Khan Academy, MIT OCW and textbooks; no public response to Pershan or Nova was found.
- Unclear whether the WASC accreditation covers the commercial product, the in-school programme, or both.
