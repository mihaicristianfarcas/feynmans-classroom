# Mastery Learning, Prerequisite Graphs, AI Tutoring and the Unit Economics of a Course-Pack Business

Notes for the market-research document. Everything below is either a primary study, a meta-analysis, a public filing, or an explicitly labelled industry estimate. Effect sizes are reported as published (d / g / Hedges' g are standardised mean differences unless stated). Labels used throughout: **[preprint]**, **[working paper]** (not peer reviewed), **[vendor-funded]** / **[vendor]** (author or publisher has a commercial interest), **[industry estimate]** and **[industry benchmark]** (consultancy or vendor data, not evidence). Where I could not verify a number, it is in Gaps rather than in the findings.

A note on the overall shape of the evidence, because it matters for how the doc should be written: the _learning-science_ literature is strong on memory (spacing, retrieval) and moderate on tutoring, but weak precisely where the product thesis is strongest — there is almost no experimental evidence that diagnosing and remediating prerequisite gaps improves outcomes, and the mastery-learning literature's largest effects shrink to near zero when outcome measures stop being experimenter-made tests. The _AI-tutoring_ literature is young, mostly preprint, and its field RCTs are an order of magnitude smaller in effect than the lab studies that get quoted.

---

## 1. Mastery learning: what Bloom's 2 sigma actually rests on, and what later meta-analyses found

### Takeaway

Bloom's "2 sigma" is not a finding about mastery learning; it is a finding about one-to-one tutoring plus mastery, drawn from two University of Chicago dissertations, measured mostly on experimenter-made tests. Independent meta-analysis (Kulik et al. 1990) finds real but heterogeneous positive effects, concentrated on weaker students and on locally-made tests; best-evidence synthesis (Slavin 1987) finds **essentially no effect on standardised achievement** for group-based mastery learning. Nothing in the 2020s supersedes that split.

### Cited Findings

- Bloom's claim: "the average tutored student was above 98% of the students in the control class", and about 90% of tutored students reached the level attained by only the top 20% of the control class. The underlying data are the doctoral dissertations of Joanne Anania (1981) and Arthur Burke (1983) — small, single-course studies — [Bloom 1984, _Educational Researcher_ 13(6):4–16](https://doi.org/10.3102/0013189X013006004) ([PDF](http://web.mit.edu/5.95/readings/bloom-two-sigma.pdf)).
- Bloom's own decomposition matters for the pitch: **tutorial instruction = 2.00 SD**, but **feedback-corrective (mastery learning) = 1.00 SD**, reinforcement 1.2, cues/explanation 1.0. The 2 sigma is the _tutoring_ column; mastery alone is half of it, in his own table — [Bloom 1984](http://web.mit.edu/5.95/readings/bloom-two-sigma.pdf).
- Kulik, Kulik & Bangert-Drowns meta-analysed **108 controlled evaluations** across college, high school and upper elementary. Effects were positive, **stronger for weaker students in a class**, and varied with the mastery procedures used, the experimental design, and course content. Mastery programs improved attitudes but **increased time on task**, and self-paced mastery programs **often reduced completion rates** in college classes — [Kulik, Kulik & Bangert-Drowns 1990, _Review of Educational Research_ 60(2):265–299](https://doi.org/10.3102/00346543060002265).
- Slavin's best-evidence synthesis, restricted to group-based mastery learning in elementary/secondary schools over **≥4 weeks**, found "essentially no evidence to support the effectiveness of group-based mastery learning on standardised achievement measures." On experimenter-made measures effects were "generally positive but moderate", with **little evidence that effects maintained over time** — [Slavin 1987, _Review of Educational Research_ 57(2):175–213](https://doi.org/10.3102/00346543057002175).
- Slavin's critique of Kulik et al. is itself published: he argues the meta-analysis pooled short studies and researcher-made tests, and that the coverage-versus-mastery trade-off (slower pacing, less content) is the mechanism behind the null on standardised tests — [Slavin 1990, "Mastery Learning Re-Reconsidered", _Review of Educational Research_](https://doi.org/10.2307/1170613).
- The 2020s literature on mastery learning is dominated by **health-professions simulation** (McGaghie's simulation-based mastery learning line), which shows large effects for procedural skills with criterion checklists — e.g. [McGaghie et al. 2014, _Medical Education_ 48(4):375–385](https://doi.org/10.1111/medu.12391) — and by practitioner reviews that simply restate "moderate effect sizes" without new pooling, e.g. [Winget & Persky 2022, _Am J Pharm Educ_ 86(10):8906](https://doi.org/10.5688/ajpe8906). I found **no new general K-12 mastery-learning meta-analysis** that supersedes Kulik 1990 / Slavin 1987 (see Gaps).
- Adaptive software is a different intervention with different evidence. ALEKS, the canonical knowledge-space product, was meta-analysed across **15 studies / 24 independent samples (2005–2015)**: it was "as good, but not better than, traditional classroom teaching", with no significant moderation by schooling level, implementation mode, or outcome type. Effects were _larger when ALEKS was used for shorter periods_ — [Fang, Ren, Hu & Graesser 2018, _Educational Psychology_ 39(10):1278–1292](https://doi.org/10.1080/01443410.2018.1495829).
- Intelligent tutoring systems (ITS) in K-12 mathematics: **26 reports, 34 independent samples**, average effects **g = 0.01 to 0.09** versus regular classroom instruction — [Steenbergen-Hu & Cooper 2013, _Journal of Educational Psychology_ 105(4):970–987](https://doi.org/10.1037/a0032447).
- ITS across domains: **107 effect sizes, 14,321 participants**, showing greater achievement than non-ITS environments — [Ma, Adesope, Nesbit & Liu 2014, _Journal of Educational Psychology_ 106(4):901–918](https://doi.org/10.1037/a0037123). (The pooled g is not in the abstract; do not quote a number from this one without the full text.)

### Inferences

- The honest framing of "mastery learning" is: **criterion-referenced assessment + corrective loop + flexible pacing**. The corrective loop is what the product implements (quiz → diagnosis → re-teach → re-quiz). That is worth "moderate" effects on **local, taught-to** assessments (Slavin's word) — up to Bloom's own 1.0 estimate for feedback-corrective instruction — and roughly ~0 on broad standardised tests. A market doc should quote the range, not the top.
- Effects concentrate on weaker students (Kulik) — commercially this is the remedial/struggling-learner segment, which is also the segment least willing to self-serve and most dependent on an instructor or parent. That is consistent with selling to "whoever teaches the book" rather than to the learner.
- Self-paced mastery _reducing completion_ (Kulik) is a direct warning for a self-study app: without external deadlines, mastery loops become an endless treadmill and users churn. The Course Pack's instructor/cohort framing is the fix, and the evidence supports that design choice.
- Bloom's table is the strongest single argument _against_ claiming mastery software delivers 2 sigma: in the original source, mastery alone was 1.0, and modern field RCTs of adaptive software land at 0.01–0.09 (Steenbergen-Hu & Cooper).

### Gaps

- No 2020s general meta-analysis of mastery learning in K-12 was located in OpenAlex/Crossref searches (queries: "mastery learning meta-analysis", title-filtered, 2020+). The field appears to have stopped pooling; the doc should say so rather than imply fresh consensus.
- I could not locate a 2011 paper specifically framed as a "Waiting for Superman" critique of Bloom. The durable critiques are Slavin 1987/1990 and VanLehn 2011 (§5). If the doc needs that citation, it needs a named author/title first — do not cite a film review as evidence.
- Kulik et al. 1990's pooled effect size is not stated in the abstract and I did not obtain the full text; the widely repeated "0.52" figure could not be verified here.

---

## 2. Knowledge-space theory and prerequisite remediation: what is actually proven

### Takeaway

Knowledge space theory gives a rigorous _representation_ of prerequisite structure and a good adaptive-testing algorithm (this is ALEKS). It has **not** been shown that diagnosing and remediating prerequisite gaps causes better learning than teaching the target skill just-in-time. The best evidence points the other way: prior knowledge predicts _rank_, not _gain_; removing prerequisite gates (corequisites) improves completion; and letting students struggle before instruction beats instruction-first by g = 0.36.

### Cited Findings

- Knowledge space theory: a learner's knowledge state is the subset of problems they can solve; the family of feasible states is closed under union, and corresponds one-to-one with a class of surmise relations (AND/OR graphs). This is the mathematical basis for adaptive, prerequisite-aware assessment — [Doignon & Falmagne 1985, _International Journal of Man-Machine Studies_ 23(2):175–196](https://doi.org/10.1016/S0020-7373(85)80031-6); book-length treatment [Doignon & Falmagne 1999, _Knowledge Spaces_](https://doi.org/10.1007/978-3-642-58625-5).
- ALEKS, the commercial implementation, is **equivalent to, not better than, traditional instruction** across 24 samples (Fang et al. 2018, above). Notably, effects were _larger for shorter exposures_, which is hard to reconcile with a story where accumulating fine-grained prerequisite repair is the value driver.
- Prior knowledge meta-analysis, **8,776 effect sizes**: the stability of individual differences (pretest–posttest correlation) is high, **r = .534**, but the correlation between prior knowledge and _normalised gain_ is **r = −.059**, "almost normally distributed, with a large 95% prediction interval" — [Simonsmeier, Flaig, Deiglmayr, Schalk & Schneider 2021, _Educational Psychologist_ 57(1):31–54](https://doi.org/10.1080/00461520.2021.1939700).
- The same finding, stated for a general audience: prior knowledge "explained large portions of variance in learning outcomes, but it did not — on average — explain variance in learning gains" — [Brod 2021, commentary in _npj Science of Learning_](https://doi.org/10.1038/s41539-021-00103-w) (commentary on Simonsmeier et al., not an independent study).
- Corequisite remediation (enrol directly in college-level English with concurrent support instead of first passing a prerequisite): a **randomised controlled trial** across five large urban Texas community colleges found completion of a first college-level English course rose by **24 percentage points within one year** and 18 pp within two years, positive across all three corequisite models — [Miller, Daugherty, Martorell & Gerber 2021, _JREE_ 15(1):78–102](https://doi.org/10.1080/19345747.2021.1932000).
- Tennessee administrative data (2010–2020) show corequisite reform improved gateway and subsequent college-level completion for **all** placement-score groups below the college threshold, with the largest math gains for _higher_-scoring remedial students — [Does Corequisite Remediation Work for Everyone? _Education Finance and Policy_ 2025](https://doi.org/10.1162/edfp_a_00451).
- Problem-solving **before** instruction (productive failure) beats instruction-first: **53 studies, 166 comparisons, g = 0.36 [0.20, 0.51]**, rising to g = 0.37–0.58 with high-fidelity implementation; effects were _weaker for second-to-fifth graders_ — [Sinha & Kapur 2021, _Review of Educational Research_ 91(5):761–798](https://doi.org/10.3102/00346543211019105).
- Scaffolding is conditional on prior knowledge: in a meta-analysis of **145 studies**, learners with low prior knowledge learned better when supported by **worked examples**, while high-prior-knowledge learners benefited more from reflection phases — overall g = 0.85 — [Chernikova, Heitzmann, Stadler, Holzberger, Seidel & Fischer 2020, _Review of Educational Research_ 90(4):499–541](https://doi.org/10.3102/0034654320933544).

### Inferences

- The defensible claim for a prerequisite graph is **diagnostic and navigational**, not causal: it tells the learner where they are and what to study next, and it powers adaptive testing (fewer items to locate a knowledge state). That is a real product benefit (time saved, less boredom) and a real data asset (a per-learner knowledge state).
- The indefensible claim is "we fix prerequisite gaps, therefore learning improves." Simonsmeier's r = −.059 says a low-prior-knowledge student is not doomed to low gains; corequisites say removing the gate often helps; productive failure says struggle-first often beats build-the-foundation-first. Gating content behind prerequisites risks the exact coverage/completion problem Kulik found with self-paced mastery.
- The right product pattern from this literature is **just-in-time remediation at the point of failure** (a worked example or a two-minute prerequisite refresher when a quiz item is missed), not a mandatory remedial module before the chapter. That pattern is supported by the worked-example finding for low-prior-knowledge learners (Chernikova 2020) and by the corequisite result.
- Commercially, the knowledge graph is better understood as **infrastructure that makes the item bank and the review history more valuable** (it lets you schedule, sequence, and explain), not as the thing the customer buys.

### Gaps

- **No RCT was found that isolates prerequisite-graph-driven remediation as the treatment** and measures downstream achievement against a just-in-time or no-remediation control. ALEKS studies evaluate the whole product, not the graph. This is the single biggest evidence hole behind the "knowledge graph" feature.
- The "prerequisite skills" literature in STEM higher ed is largely correlational (e.g. a 2026 Ghanaian study of 90 students finding prerequisite chemistry knowledge predicts thermochemistry achievement — [DOI](https://doi.org/10.32674/pzhze917)); correlations of this kind do not establish that remediation helps.
- Worked-example / expertise-reversal primary sources (Sweller, Kalyuga) were not independently verified here; the Chernikova meta-analysis is the citable proxy.

---

## 3. Spaced repetition and retrieval practice: the strongest effects in the whole document — and the weakest willingness to pay

### Takeaway

Spacing and retrieval practice are the most robust interventions in learning science, with effect sizes that survive classrooms and delays. But they are **commoditised infrastructure**: the algorithms are public, the best implementation (Anki) is free, and the commercial failure mode is adherence, not efficacy. Their value to the Course Pack is retention and switching cost (accumulated review history), not a feature anyone will pay a premium for.

### Cited Findings

- Cepeda et al.'s meta-analysis: **839 assessments of distributed practice in 317 experiments from 184 articles**. The core result is an interaction, not a single number: the inter-study interval that maximises retention **increases as the retention interval increases** — [Cepeda, Pashler, Vul, Wixted & Rohrer 2006, _Psychological Bulletin_ 132(3):354–380](https://doi.org/10.1037/0033-2909.132.3.354).
- Optimal gap, measured directly: in two three-session experiments with test delays up to **6 months**, the optimal gap improved final recall by **up to 150%**, and the gap–retention function was non-monotonic (rises then declines) — [Cepeda, Coburn, Rohrer, Wixted, Mozer & Pashler 2009, _Experimental Psychology_ 56(4):236–246](https://doi.org/10.1027/1618-3169.56.4.236).
- Retrieval practice: testing produced **substantially greater retention than restudying at 2-day and 1-week delays**, even though repeated studying _increased students' confidence_ — the metacognitive illusion that makes learners prefer the worse strategy. At a 5-minute delay, repeated study was _better_ — [Roediger & Karpicke 2006, _Psychological Science_ 17(3):249–255](https://doi.org/10.1111/j.1467-9280.2006.01693.x).
- Dunlosky et al.'s review of ten techniques rates **practice testing and distributed practice as "high utility"**, and highlighting, rereading, summarisation and keyword mnemonics as low utility — [Dunlosky, Rawson, Marsh, Nathan & Willingham 2013, _Psychological Science in the Public Interest_ 14(1):4–58](https://doi.org/10.1177/1529100612453266).
- Quantifying Dunlosky's ten: **242 studies, 1,619 effects, 169,179 unique participants, overall mean 0.56**; distributed practice and practice testing largest; effects much greater for **lower-ability students** and much larger on **surface/factual** than relational outcomes — [Donoghue & Hattie 2021, _Frontiers in Education_ 6:581216](https://doi.org/10.3389/feduc.2021.581216).
- In real classrooms: **50 experiments, n = 5,374**, 57% showing medium or large benefits from retrieval practice — [Agarwal, Nunes & Blunt 2021, _Educational Psychology Review_ 33(4):1409–1453](https://doi.org/10.1007/s10648-021-09595-9).
- The adherence problem, measured: a semester-long study in which **62** university Spanish learners were _required_ to use Anki found it effective but experienced as a "bitter pill" — [Seibert Hanson & Brown 2019, _Computer Assisted Language Learning_](https://doi.org/10.1080/09588221.2018.1552975). (Study title: "Enhancing L2 learning through a mobile assisted spaced-repetition tool: an effective but bitter pill?")
- Spacing algorithms are optimisation problems with published solutions, not proprietary science — [Tabibian, Upadhyay, De, Zarezade, Schölkopf & Gomez-Rodriguez 2019, _PNAS_ 116(10):3988–3993](https://doi.org/10.1073/pnas.1815156116). Duolingo's half-life regression is published in full — [Settles & Meeder 2016, _ACL_](https://doi.org/10.18653/v1/P16-1174).

### Inferences

- **Effect size ≠ willingness to pay.** The two highest-utility techniques in the literature are also the two with the most free implementations (Anki, Quizlet's free tier, every textbook's end-of-chapter questions). A paid product cannot charge for "spaced repetition"; it can charge for _the right cards, aligned to a specific book and course, with the learner's history kept_.
- FSRS-style scheduling is genuinely better than SM-2 (fewer reviews for the same retention), but the user-visible benefit is "less work", which is hard to demo and easy to copy. It is a retention/COGS feature.
- The commercial asset is the **review log**: it is per-user, non-transferable, and makes leaving costly. That is a switching-cost moat, and it compounds only if the product is used across many books/courses.
- Because optimal gap depends on the test horizon (Cepeda 2006), a scheduler that targets "exam in 6 weeks" will beat a generic "retain forever" scheduler for students. That is a _course-specific_ parameter — which supports the Course Pack framing (the pack knows the exam date and the syllabus).

### Gaps

- No public data on willingness to pay for SRS specifically. Anki is free/donation; Quizlet Plus is ~$36/year; no A/B pricing evidence was found. The claim "people don't pay for scheduling" is an inference from market structure, not a study.
- Retention/churn benchmarks for SRS apps specifically were not found; the closest is the all-category subscription data in §6.

---

## 4. AI tutoring RCTs, 2024–2026: big lab effects, small field effects, and one clear failure mode

### Takeaway

The credible RCTs point to a **small positive field effect** (≈0.06–0.15 SD/year, or +4 pp mastery), concentrated when the AI supports a human or is tightly scaffolded. The one large effect (Kestin, 0.6–1.3 SD) comes from a single-course, within-subject comparison against in-class active learning, and has not been replicated at scale. The clearest negative result is not "AI doesn't teach" but "unguarded chat makes practice look better and learning worse" (Bastani, −17%).

### Cited Findings

- **Kestin et al. 2025** (peer-reviewed version of the 2024 preprint): randomised controlled experiment in a large undergraduate physics course at Harvard, **N = 194** (233 enrolled). Students in the AI-tutored condition had higher median post-test scores (4.5 vs 3.5) and "median learning gains … over double" those of the in-class active-learning group, in **less time**. Linear regression effect size **0.63 SD**; because of a ceiling effect, quantile regression gives **0.73–1.3 SD**; p < 10⁻⁸ — [Kestin, Miller, Klales, Milbourne & Ponti 2025, _Scientific Reports_ 15:17458](https://doi.org/10.1038/s41598-025-97652-6). Design caveat: it is a within-subject crossover, single institution, single topic, unblinded, and the AI condition was self-paced outside class — so the estimate bundles tutor quality with time, place and pacing.
- **Tutor CoPilot** (preregistered RCT, **900 tutors and 1,800 K-12 students** in under-served communities): students with tutors who had access to the human-AI co-pilot were **4 percentage points more likely to master topics** (p < 0.01); students of **lower-rated tutors improved by 9 pp**. Cost: **$20 per tutor per year**. Tutors with the tool asked more guiding questions and gave fewer direct answers (550,000+ messages analysed) — [Wang, Ribeiro, Robinson, Loeb & Demszky 2024, arXiv:2410.03017 (v3, Oct 2026)](https://arxiv.org/abs/2410.03017) **[preprint]**.
- **Khanmigo in schools** — the most important field result so far. Two-year **cluster randomised trial in 18 Tennessee middle schools**, Khanmigo configured to coach rather than answer, used during existing daily remedial maths sessions: **+1.3 national percentile ranks per term**, i.e. **0.06–0.08 SD over a school year**, with an implied **0.14 SD** for a full year of _active_ participation. Crucially, gains "resemble those from Khan Academy practice without AI assistance." Usage: 96% of students tried it at least once, but the **median student messaged it on only one third of the days they practised**, and only in **17% of exercise sessions where they made a mistake** — [Oreopoulos & Low 2026, NBER Working Paper 35620](https://doi.org/10.3386/w35620) **[working paper, not yet peer reviewed]**.
- **StudentBench** (2026): **2,383 participants** on GRE Quantitative and Verbal items, assigned to AI tutoring, human tutoring, or no tutoring. AI tutoring was **statistically equivalent to expert human tutoring** (p = .015), and in 5 of 7 GRE domains the best AI tutor beat the human tutor on average. Cost per percentage point gained: **$0.0052 for AI vs $4.81 for human — 918× cheaper** — [arXiv:2609.28470](https://doi.org/10.48550/arXiv.2609.28470) **[preprint, Sept 2026; not peer reviewed]**.
- **Bastani et al. 2025** — field experiment with **nearly a thousand** Turkish high-school maths students, two GPT-4 tutors. With access during practice, grades improved **48% (GPT Base)** and **127% (GPT Tutor, scaffolded)**. When access was removed, **GPT Base students performed 17% worse than students who never had access**; the scaffolded "GPT Tutor" largely eliminated the harm. Mechanism: students used the raw chatbot as a "crutch" — [Bastani, Bastani, Sungu, Ge, Kabakcı & Mariman 2025, _PNAS_ 122(26):e2422633122](https://doi.org/10.1073/pnas.2422633122). A correction notice exists ([PNAS 2025](https://doi.org/10.1073/pnas.2518204122)); a methodological critique of the study design is posted at [SSRN 4898213](https://doi.org/10.2139/ssrn.4898213) — I did not read the critique, so treat its force as unknown.
- Adjacent 2026 evidence that adaptivity, not chat, is doing the work: a five-month RCT with **770 high-school students in ten Taipei schools** found that **adaptive problem sequencing** (informed by behavioural signals) raised final-exam performance by **0.15 SD** versus fixed sequencing, with gains mediated by sustained engagement rather than more practice — [2026, _HCI Review_](https://doi.org/10.70175/hclreview.2020.34.3.3) **[peer-review status unclear; treat as weak]**.
- **Khanmigo's own price** is the market anchor for consumer AI tutoring: **$4/month or $44/year**, free for teachers — [khanmigo.ai/pricing](https://www.khanmigo.ai/pricing) **[vendor]**.

### Inferences

- The distribution of credible effects is: **0.06–0.15 SD/year in real schools** (Khanmigo, Taipei), **+4 to +9 pp mastery** when AI augments a human tutor at $20/tutor/year (Tutor CoPilot), **0.6–1.3 SD in one well-designed single-course study** (Kestin), and **equivalence to human tutors at ~1/900th the cost on test-prep items** (StudentBench).
- The binding constraint is **engagement, not capability** (Khanmigo: one third of practice days, 17% of error moments). This is the single most useful finding for a book-centred product: a textbook chapter with assigned figures and quizzes creates a reason to open the app on a schedule; a blank chat box does not.
- The failure mode is **answer-giving**. Any product that puts a general chat model next to homework without guardrails risks the Bastani −17%. A book-centred app that generates explanations _about a specific figure or paragraph_, with the quiz as the gate, is structurally closer to "GPT Tutor" than to "GPT Base" — but only if the design forbids "just tell me the answer".
- Cost is no longer a moat in either direction: AI tutoring is already ~$44/year retail (Khanmigo) and inference keeps getting cheaper (§6). The moat has to be the content and the learner state.

### Gaps

- No peer-reviewed, multi-site RCT of a _standalone_ LLM tutor in K-12 with standardised achievement outcomes was found as of October 2026. Khanmigo is the closest and is an NBER working paper.
- Khanmigo results are inseparable from Khan Academy's existing content and practice system; there is no clean "Khanmigo vs Khan Academy" AI-attributable effect (the paper says they resemble each other, which is itself the finding).
- Kestin's effect has not been replicated; no independent replication attempt was located.
- StudentBench is a preprint with a vendor-adjacent design (it benchmarks models); its cost comparison is useful but should be labelled as such.

---

## 5. The two-sigma / "AI replaces tutors" claim: what is overclaimed, and the credible ceiling

### Takeaway

Two sigma is not a property of tutoring; it is an artefact of two small 1980s dissertations and experimenter-made tests. The best modern estimate of human one-to-one tutoring versus no tutoring is **d ≈ 0.79** (VanLehn 2011), and real-world tutoring programmes pool at **0.37 SD** (Nickow et al. 2020). Software has roughly matched human tutoring on narrow outcomes since 2011. The credible ceiling for an AI tutor in a real course is therefore **~0.1–0.4 SD**, not 2.0.

### Cited Findings

- VanLehn's review of experiments comparing human tutoring, computer tutoring and no tutoring: the folklore values were d = 0.3 (answer-based CBT), 1.0 (ITS) and **2.0 (adult human tutors)**. The review "did not confirm these beliefs": **human tutoring d = 0.79**, **ITS d = 0.76** — nearly as effective as human tutoring, and nowhere near 2 sigma — [VanLehn 2011, _Educational Psychologist_ 46(4):197–221](https://doi.org/10.1080/00461520.2011.611369).
- Field tutoring at scale: pooled effect of **0.37 SD** across preK-12 tutoring experiments, stronger for teacher/paraprofessional programmes than for volunteers or parents — [Nickow, Oreopoulos & Quan 2020, NBER WP 27476](https://doi.org/10.3386/w27476).
- One-to-one tuition in English schools: about **+5 additional months' progress**, at a cost of **£167–£180 per pupil per 15-hour block** under the National Tutoring Programme (Year 1, 2020–21), with online cheaper than in-person and qualified teachers more expensive — [EEF Teaching and Learning Toolkit, "One to one tuition"](https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/one-to-one-tuition) **[evidence synthesis, not a single study]**.
- Bloom himself framed 2 sigma as a _problem to be solved by group instruction_, not a benchmark any technology had met — [Bloom 1984](http://web.mit.edu/5.95/readings/bloom-two-sigma.pdf).

### Inferences

- **What is overclaimed:** (a) that 2 sigma is an established tutoring effect; (b) that mastery software alone approaches it (Bloom's own table says 1.0, and field ITS is 0.01–0.09 in K-12 maths); (c) that an AI tutor's single-course result (Kestin, 0.6–1.3) generalises to a year of schooling. Kestin compares against in-class active learning in one Harvard physics course; Khanmigo, the only multi-school RCT, finds 0.06–0.08 SD/year.
- **What is credible:** an AI tutor that is well-scaffolded, attached to a specific curriculum, and used regularly can plausibly deliver **0.1–0.4 SD**, i.e. roughly the low end of human tutoring and the high end of good curriculum materials. At 0.2 SD, that is ~2–3 percentile points — real, sellable, and nothing like 2 sigma.
- The economic argument survives even at small effects: $44/year for unlimited use versus roughly £11 per hour of subsidised human tutoring (EEF) is one to two orders of magnitude cheaper per hour, and StudentBench measures 918× cheaper per percentage point of gain. **The business case does not need 2 sigma; it needs 0.1–0.2 SD at consumer prices.** The doc should make that substitution explicitly, because a sophisticated reader will otherwise discount the whole section.
- The "AI replaces tutors" claim is least credible where human tutoring's effect comes from _accountability and relationships_ (Nickow: teachers/paraprofessionals > volunteers/parents) rather than from explanation quality. Kestin's tutor is a content tutor, not a mentor; Tutor CoPilot's gain is largest for the _weakest tutors_, which suggests AI substitutes for expertise, not for presence.

### Gaps

- No study directly estimates the effect of an AI tutor over a full academic year on standardised tests in a high-income country, peer-reviewed. Khanmigo (0.06–0.08 SD/year) is the best available and is a working paper.
- The claim that AI tutoring "scales" has no cost-at-scale evidence beyond Tutor CoPilot ($20/tutor/year) and Khanmigo ($4/month retail); institutional deployment costs (devices, IT, training, moderation) are not in any study found.

---

## 6. Economics: cost per student, gross margins, content cost curves, CAC and churn

### Takeaway

The unit economics of a content business are excellent (gross margins 54–72% at Duolingo, Chegg, Coursera) and the marginal cost of AI is collapsing (median ~50×/year price decline for equivalent capability). That combination means **the model cannot be the moat and content alone is not enough either** — Chegg's revenue halved in four years while its gross margin stayed ~60–70%. What survives is content that is _bound to a course and a learner's history_, sold through a channel with low CAC. The weak point in the Course Pack thesis is churn: AI-native subscription apps retain only ~6% of monthly subscribers at 12 months.

### Cited Findings

**Cost per student**
- Human tutoring, subsidised at scale: **£167–£180 per 15-hour block** (EEF/NTP Year 1). At two sessions a week for a 30-week year (~60 hours) that is roughly **£670–£720 per pupil per year at subsidised rates**; private retail rates are multiples of that (see Gaps).
- AI tutoring, retail: **$44/year** (Khanmigo) — [khanmigo.ai/pricing](https://www.khanmigo.ai/pricing) **[vendor]**.
- AI augmenting a human tutor: **$20 per tutor per year** (Tutor CoPilot) — [Wang et al. 2024](https://arxiv.org/abs/2410.03017).
- Cost per percentage point of learning gain: **$0.0052 (AI) vs $4.81 (human)** = 918× — [StudentBench 2026](https://doi.org/10.48550/arXiv.2609.28470) **[preprint]**.

**Content cost curve**
- Price of achieving a fixed capability level in LLM inference fell **9× to 900× per year** across benchmarks, **median 50×/year**, measured over the three years to March 2025 — [Cottier, Snodin, Owen & Adamczewski 2025, Epoch AI](https://epoch.ai/blog/llm-inference-price-trends) **[industry research, method disclosed]**.
- Consequence: generating an explanation, a quiz item, or a figure caption is approaching zero marginal cost. The scarce inputs become **editorial judgement, answer keys, and the learner's response history**.

**Gross margins (primary filings, SEC XBRL)**
| Company                         | FY2021        | FY2023        | FY2024        | FY2025              |
| ------------------------------- | ------------- | ------------- | ------------- | ------------------- |
| Duolingo revenue / gross margin | $251M / 72.4% | $531M / 73.2% | $748M / 72.8% | **$1,038M / 72.2%** |
| Chegg revenue / gross margin    | $776M / 67.2% | $716M / 68.5% | $618M / 70.7% | **$377M / 59.6%**   |
| Coursera revenue / gross margin | $415M / 60.1% | $636M / 51.9% | $695M / 53.5% | **$758M / 54.6%**   |

Source: SEC `companyfacts` API for Duolingo (CIK 0001562088), Chegg (CIK 0001364954), Coursera (CIK 0001651562), 10-K figures, retrieved October 2026.

**Churn and conversion (consumer subscription benchmarks)**
- AI-powered apps earn **41% more revenue per payer** ($30.16 vs $21.37 in year one) but **churn ~30% faster**, and **underperform on 12-month retention**: weekly plans **2.5% vs 3.4%**, monthly plans **6.1% vs 9.5%**, annual plans **21.1% vs 30.7%**. Refund rates 4.2% vs 3.5% — [RevenueCat, _State of Subscription Apps_ (2026 edition)](https://www.revenuecat.com/state-of-subscription-apps/) **[industry benchmark, 15,000+ apps; self-selected sample]**.
- Hard paywalls convert **5× better than freemium** (10.7% vs 2.1%), but 12-month retention converges — same source.
- Education apps skew annual (59–66% of revenue from annual plans), unlike Productivity (77% monthly) — same source.

**Market structure / demand**
- Chegg's revenue fell from **$776M (2021) to $377M (2025)**, −51%, while gross margin stayed 60–70%: the content was still cheap to serve, the demand disappeared. Causation is not proven by the filing, but the timing coincides with free generative AI answering the same homework questions (inference).
- Coursera's gross margin (~55%) is structurally lower than Duolingo's (~72%) because it pays instructors/partners and runs content production; marketplace content is a lower-margin business than owned content — inferred from the filings' cost lines, not disclosed as such.

### Inferences

- **Content businesses have durable _gross_ margins, not durable _revenue_.** Chegg is the cautionary case: 70% gross margin and a halving top line. The moat must be something the model cannot regenerate — a specific book's structure, an instructor's assessment design, and a learner's accumulated state.
- **The Course Pack's economics work if CAC is low.** At $44/year (Khanmigo anchor) and ~70% gross margin, contribution is ~$31/year per learner; with 12-month retention of 6.1% on monthly plans (21.1% on annual), LTV is thin unless renewal is institutional, so the pack must be sold per course and renewed by an instructor/cohort, not acquired one learner at a time. Selling to "whoever teaches the book" is precisely a CAC strategy: one instructor brings a class of 20–200, and the instructor's syllabus makes the pack the default.
- **Inference cost is a tailwind, not a moat.** A local-first app that runs on the user's own Claude/Codex login pushes inference cost onto the user, which is a genuine structural advantage: COGS is near zero and does not scale with usage. That is a stronger version of the "model is not the moat" argument — it removes the model from the P&L entirely.
- **Accumulated review history is the best switching cost in the stack.** It is per-learner, improves with use, and cannot be regenerated by a competitor's model. The knowledge graph is what makes that history legible and portable across books.

### Gaps

- **No reliable public CAC benchmark for consumer edtech** was found. RevenueCat gives conversion and retention, not acquisition cost. Any CAC number in the doc must be labelled an assumption.
- Private retail tutoring rates ($40–$100/hour in the US/UK) are widely reported but I could not verify a primary source in this session; use the EEF block cost as the citable anchor and present retail as a range with a caveat.
- No public data on instructor willingness to pay for a course pack, or on institutional procurement cycles.
- Chegg's causal attribution to AI is an inference from timing, not a disclosed claim.

---

## 7. Market sizing sanity checks: the spread is the finding

### Takeaway

Estimates of the global private tutoring market for 2025 range from **$67B to $240B** — a 3.6× spread — and at least one published figure is off by three orders of magnitude. K-12 digital content has no comparable public estimate that survives scrutiny. The doc should size the _addressable slice_ bottom-up (instructors × courses × price) and use the top-down numbers only to show the order of magnitude.

### Cited Findings

- Global private tutoring market, 2025 estimates:
  - **$66.96B in 2025 → $160.50B by 2034** — [Fortune Business Insights](https://www.fortunebusinessinsights.com/private-tutoring-market-104753) **[industry estimate]**.
  - **$133.8B in 2025** — [Research and Markets](https://www.researchandmarkets.com/reports/5946820/private-tutoring-market-size-share-trends) **[industry estimate]**.
  - **$239.8B in 2025** — [Dataintelo](https://dataintelo.com/report/private-tutoring-market) **[industry estimate, low-quality]**.
  - Grand View Research's page snippet reports "**USD 109.7 million** in 2025" — almost certainly a unit error for $109.7B, which is itself evidence of how little these numbers can be trusted — [Grand View Research](https://www.grandviewresearch.com/industry-analysis/private-tutoring-market-report) **[industry estimate]**.
  - Deep Market Insights is quoted at "**USD 96,172.4 Billion** in 2025" — a figure that is physically impossible and demonstrates the bottom of the source-quality distribution — [Deep Market Insights](https://deepmarketinsights.com/vista/insights/private-tutoring-market/global) **[industry estimate, unusable]**.
- Higher-ed study tools, revealed by revenue rather than forecasts: Chegg **$377M (FY2025)**, down from $776M (FY2021); Coursera **$758M (FY2025)** — SEC filings as above. These are the only sizing numbers in this section that are audited.
- Consumer AI tutoring price points: Khanmigo **$4/month, $44/year**; Duolingo's premium tiers are in the same order of magnitude (Duolingo FY2025 revenue $1.04B, 72% gross margin, SEC).
- I found **no defensible public estimate of the K-12 digital content market** that separates content licensing from hardware, platforms, and services (see Gaps).

### Inferences

- The spread comes from definition, not measurement error: some estimates count only formal, paid, supplementary K-12 tutoring; others include test prep, adult/language learning, informal offline payments (notably in East Asia), and B2B services. A doc that cites one number without saying which definition it uses is not doing analysis.
- **Bottom-up is the only honest way to size the Course Pack.** Example arithmetic the doc can run: number of US higher-ed course sections using a given textbook (a mainstream intro text may be adopted in hundreds of sections) × 30–200 students × $20–$50 per student per course. That yields a per-book TAM in the low tens of millions, which is the right scale for a niche content business and is not embarrassing — but it is 3–4 orders of magnitude below the "$240B tutoring market" framing.
- The tutoring market's size is a _labour_ market (hours × hourly wage). Software does not capture labour-market revenue; it captures a small fee per learner. Using the tutoring TAM to argue software upside is the classic error the doc should explicitly refuse.

### Gaps

- No reliable, methodologically documented estimate of the K-12 digital content market or the higher-ed study-tools market was found. Both should be sized bottom-up or omitted.
- None of the market-research firms disclose methodology; the spread (3.6×) and the unit errors above are the only quality signal available.

---

## 8. What this means for the Course Pack argument (evidence for and against)

### Takeaway

The evidence supports "content + accumulated learner state is the moat" more strongly than it supports "mastery/prerequisite science proves the product works." The strongest pro-case is economic and structural (falling inference cost, 60–72% gross margins, per-learner review history, instructor-mediated CAC); the strongest anti-case is behavioural (engagement, churn, and the fact that generic models already match human tutors at near-zero cost).

### Cited Findings (assembled from above)

- **For:** Bloom's mastery loop produces moderate-to-large effects on local measures (Bloom's own 1.0 for feedback-corrective instruction; Slavin's "moderate" on experimenter-made tests; Kulik's 108 evaluations positive, strongest for weaker students); spacing and retrieval are the most robust effects in the literature (Cepeda 2006; Dunlosky 2013; Donoghue & Hattie 2021, mean 0.56 across 169,179 participants); AI-augmented humans produce +4 to +9 pp mastery at $20/tutor/year (Tutor CoPilot); content businesses earn 54–72% gross margins (SEC); inference costs fall ~50×/year (Epoch AI); AI-native apps monetise 41% better per payer but retain far worse (RevenueCat 2026).
- **Against:** group mastery learning shows ~0 on standardised tests (Slavin 1987); ALEKS is no better than traditional teaching (Fang et al. 2018); K-12 ITS maths effects are g = 0.01–0.09 (Steenbergen-Hu & Cooper 2013); prior knowledge barely predicts learning gains (r = −.059; Simonsmeier 2021); prerequisite gating is contradicted by corequisite (+24 pp) and productive-failure (g = 0.36) evidence; unguarded AI chat reduces later performance by 17% (Bastani 2025); the only multi-school AI-tutoring RCT finds 0.06–0.08 SD/year with one-third-of-days usage (Oreopoulos & Low 2026); Chegg lost half its revenue in four years despite 60–70% gross margins; only 6.1% of monthly AI-app subscriptions survive 12 months (RevenueCat).

### Inferences

- The doc should **decouple the product claim from the mastery claim**. The Course Pack does not need to promise 2 sigma or prerequisite repair; it needs to promise (a) a specific book taught well, (b) scheduled retrieval that saves time, (c) an instructor's assessment loop, and (d) a learner record that compounds. Each of those has direct evidence; the grand claims do not.
- The **moat argument is strongest in the local-first/GPLv3 detail**: because inference runs on the user's own login, COGS does not scale with usage, and because the pack is tied to a book's structure and an instructor's syllabus, a competitor's better model does not substitute for it. That is a more defensible position than "our AI is better", which StudentBench shows is a losing race (frontier models converge on tutoring equivalence).
- The **weakest link is retention**, and it is a product-design problem, not a content problem. Khanmigo's usage data (median student messages on one third of practice days; 17% of error moments) is the best available evidence that AI tutoring is opened rarely. A book-centred app's advantage is that reading is already a scheduled activity; the doc should say that explicitly and treat "attaches to assigned reading" as the retention mechanism.
- The **pricing implication**: at $44/year (Khanmigo) the consumer ceiling is low; selling per-course to an instructor at $10–$30/student with a class-sized minimum is the only way to get contribution margin above CAC without a large marketing spend. That is an inference from the margin/retention arithmetic, not a tested pricing study.

### Gaps

- No experimental evidence that a "course pack" sold to instructors improves learning versus the same content free — the central claim is untested.
- No data on instructor conversion, renewal, or price sensitivity.
- The GPLv3/fork risk (a competitor hosting the same pack) is not addressed by any evidence found; it is a legal/strategy question, not an empirical one.

---

### Source-quality key (applies to the whole document)

- **Strongest sources in this document:** SEC XBRL filings (audited), the peer-reviewed meta-analyses (Cepeda 2006; VanLehn 2011; Kulik 1990; Slavin 1987; Simonsmeier 2021; Sinha & Kapur 2021; Fang et al. 2018), and the peer-reviewed RCTs (Kestin 2025; Bastani 2025; Miller et al. 2021).
- **Preprints / working papers:** Wang et al. 2024 (Tutor CoPilot), Oreopoulos & Low 2026 (Khanmigo, NBER), StudentBench 2026 (arXiv), the OSF cognitive-offloading meta-analysis (unpublished; not cited above as evidence).
- **Vendor-funded / vendor-published:** Khanmigo pricing and efficacy claims; ALEKS efficacy materials from McGraw Hill (not used above — the independent 2018 meta-analysis is used instead); Duolingo's published HLR paper (methodologically sound but authored by employees).
- **Industry estimates, not evidence:** every market-size figure in §7, RevenueCat benchmarks (large sample but self-selected), Epoch AI (disclosed method, not peer reviewed).
- **Deliberately not used:** blog posts, LinkedIn/Substack commentary, "AI tutor" vendor case studies, and the "cognitive offloading" literature, which at this date is dominated by cross-sectional surveys and unpublished meta-analyses and cannot carry a causal claim.
