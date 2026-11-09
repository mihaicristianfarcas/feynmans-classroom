# Model access: the user's own AI plan, and what it costs us

Checked 9 November 2026. Labels: **[primary]** the vendor's own developer, legal or help page;
**[secondary]** press or blogs. Quotes are exact. Nothing here is legal advice.

## Takeaway

The "no API keys, the user's own plan" design is the source of our cost advantage, and its
legality now depends on which vendor. **OpenAI** documents a self-serve path for open-source and
local apps to use a ChatGPT plan, with an application for paid or hosted ones. **Anthropic**
forbids third-party apps to offer Claude login or to route requests through consumer plans.
**Google** gives a free daily quota to a personal account through the Gemini CLI. So: build the
paid product on Sign in with ChatGPT, keep the CLIs for power users, and add an optional fallback
so one vendor's change can't stop the product.

---

## 1. OpenAI: Sign in with ChatGPT

From OpenAI's developer pages [primary,
[overview](https://developers.openai.com/siwc/token-sharing-open-source),
[sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[Codex app server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)]:

- Scope: "These docs explain ChatGPT plan usage for open-source and locally hosted apps. If you're
  interested in offering it in a paid or remotely hosted app, complete the interest form."
- Registration for open-source apps is self-serve: "Start first-time registration with
  client_id=dynamic_agent_client". It "needs neither a client secret nor a partner API key."
- Plan usage needs the scope `chatgpt.tokens.use.direct`; "A valid ID token alone does not
  authorize ChatGPT plan usage."
- An app can run `codex app-server` and give it the app's own token: "No separate Codex sign-in is
  required." The app must "read its own token file and supply the access token to the child
  process."

From coverage of DevDay 2026 [secondary,
[XenoSpectrum](https://xenospectrum.com/en/chatgpt-sign-in-subscription-apps/),
[The New Stack](https://thenewstack.io/sign-in-with-chatgpt/)]: plan usage covers **Plus and Pro**;
it draws on the plan's shared ChatGPT and Codex allowance; users set a weekly cap per app; image
generation, hosted file search and Code Interpreter aren't available to open-source apps; launch
partners include **OpenCode**, Notion, Warp, Devin, Vercel and others. No revenue share was
announced.

**For us:** the free AGPL app fits the open-source route today; our existing Codex driver can be
fed our own token through `codex app-server`. Any *paid* tier that uses plan usage needs the
interest form first. Business and Enterprise seats aren't mentioned, so engineers using only a
work seat may not be covered.

## 2. Anthropic: no third-party routing through consumer plans

From Claude Code's legal and Agent SDK pages [primary,
[legal and compliance](https://code.claude.com/docs/en/legal-and-compliance),
[Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview.md)]:

- "Anthropic does not permit third-party developers to offer Claude.ai login into their own
  applications."
- Developers may not "route requests through Free, Pro, Max, or Ultra plan credentials on behalf
  of their users."
- "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai
  login."
- It does not "prevent an end user from signing in to the unmodified Claude Code binary with their
  own Claude subscription."
- Plan limits "are shared across Claude and Claude Code, meaning all activity in both tools counts
  against the same limits" [primary,
  [help centre](https://support.claude.com/en/articles/11145838-using-the-agent-sdk-with-your-claude-plan)].

History [secondary]: documentation tightened in February 2026
([WinBuzzer](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/));
in May a separate monthly credit for `claude -p` and the Agent SDK was announced for 15 June
([GIGAZINE](https://www.gigazine.net/gsc_news/en/20260514-anthropic-claude-agent-sdk-credits)), with
one report of it being withdrawn
([wmedia.es](https://wmedia.es/en/tips/claude-code-agent-sdk-credit)). The pages read today don't
mention a separate credit.

**For us:** today the app drives the user's own, unmodified `claude` binary with their login.
That is defensible for a free tool the user runs on their own machine, but "routing requests …
on behalf of their users" is close enough that **no paid tier should depend on it**.

## 3. Google: a free daily quota

The Gemini CLI quota page lists **1,000 requests a day** for a personal Google account (Gemini Code
Assist individual), 1,500 with Google AI Pro, 2,000 with Ultra; an unpaid API key gets 250 a day,
Flash only [secondary, quoting
[geminicli.com](https://geminicli.com/docs/resources/quota-and-pricing/)]. Other reports say it rose
to 1,500 in May 2026 or was cut in June; unconfirmed [secondary].

**For us:** a possible free path for people without a paid plan. It would be a fourth driver
behind `server/llm/`, and its terms for third-party use need checking first.

## 4. Platform risk is real

We are a **complement** to the vendors' subscriptions: we make a ChatGPT plan more useful, at no
cost to OpenAI's margins on our side. That aligns us with a vendor that courts complements
(OpenAI, today) and exposes us to one that doesn't (Anthropic, today). Terms move:

- Reddit's 2023 API pricing would have cost the Apollo app about $20M a year; Apollo shut down on
  30 June 2023, along with other third-party clients [secondary,
  [TechCrunch](https://techcrunch.com/2023/06/08/popular-third-party-reddit-app-apollo-is-shutting-down-as-a-result-of-reddits-new-api-pricing/embed/),
  [Engadget](https://www.engadget.com/apollo-and-other-popular-third-party-reddit-apps-have-shut-down-123149140.html)].
- Anthropic's own position changed at least twice in 2026 (above).

**Mitigation:** more than one way in (ChatGPT sign-in, the CLIs, an optional key or local model),
and nothing in the paid tiers that *requires* model calls on our side: packs are made once by us
and read locally.

## 5. Economics: why this is the advantage

- AI products' gross margins average about **52%** (2026 projection), up from 41% in 2024, against
  traditional SaaS roughly 25–30 points higher; pure application-layer companies about **45%**;
  inference about **23% of revenue** at scale [secondary, citing ICONIQ's 2026 State of AI,
  [SaaStr](https://www.saastr.com/the-execution-era-of-ai-5-key-takeaways-from-iconiqs-state-of-ai-report)].
- Inference prices fall fast (a median ~50× a year, Epoch AI, cited in the previous research), so
  hosting models is a cost that shrinks but never disappears, and every competitor who hosts them
  carries it.
- **Our cost of goods:** pack production (agent time on our own plan plus human review), sync
  storage, and support. No per-user inference. That is what lets us price under $89–$373 a year
  and still keep a software margin.

## 6. What to build

1. **Sign in with ChatGPT** as the default way in, using dynamic registration and `codex
   app-server` with our token. Show the per-app weekly cap in Settings.
2. **Apply** through OpenAI's interest form before charging for anything that uses plan usage.
3. **Keep the CLIs** (Codex, Claude Code, OpenCode) for power users, unchanged.
4. **Decide on "No API keys, ever"** (`AGENTS.md`): keep it as the default and the free tier's
   rule, but allow an optional key or local model so the product survives a vendor's change.
5. **Packs need no model at read time:** figures, questions and the concept graph are files.

## Gaps

- The Codex help article on plan eligibility returned 403; plan coverage for Business and
  Enterprise is unconfirmed.
- Whether a non-bare `claude -p` run from another app counts as "routing on behalf of" the user:
  ask Anthropic before relying on it.
