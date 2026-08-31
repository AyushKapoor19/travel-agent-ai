# Wayfare — AI Travel Agent

Say one sentence about the trip you want. Wayfare asks a few follow-up questions, then looks up real
hotels, fares, things to do and ten years of weather before writing a day-by-day itinerary out of what
it found.

**Live:** [travel-agent-ai-three.vercel.app](https://travel-agent-ai-three.vercel.app/)

> **Note:** the SerpApi key behind the deployment is nearly out of searches. Once it runs dry, stays,
> fares and activities come back empty and the plan is built without them. Run it locally with your
> own keys to see it end to end.

## What it can do

- **Reads whatever you give it.** "Two of us in Tokyo for a week in April, mid-range, mostly here for
  the food" answers five of the seven intake questions at once. It asks only the two that are left.
- **Interviews you one question at a time**, with quick-reply chips and a progress meter. Answered
  questions never come back; optional ones can be declined.
- **Picks the destination if you'd rather.** "Somewhere warm in Europe" returns a shortlist of two or
  three verified places — the model proposes four or five, the code geocodes each, measures its
  climate for your month, prices real rooms for your dates, and looks up the sights listed there.
- **Plans the trip**, with the evidence beside it as cards: climate against the rest of the year,
  hotels at Google's quoted rate, activities with ratings and entry prices, fares with Google's
  verdict, a cost floor against your budget, a photo per day.
- **Takes follow-ups.** "Swap Tuesday for something indoors." It re-runs the tools it needs and writes
  only what changed, underneath the plan — the itinerary you were reading stays where it is.

## Running it locally

Node 22 (`engines` pins it, `.nvmrc` matches). Node 20 is the real floor — Tailwind v4's native binary
needs it.

```bash
nvm use
cp .env.example .env.local   # add your Gemini and SerpApi keys
npm install
npm run dev
```

Gemini key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — free, no card. SerpApi
key: [serpapi.com/users/sign_up](https://serpapi.com/users/sign_up) — free, 250 searches a month.
[Configuration](#configuration) covers the optional ones.

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind v4, AI SDK v6 with `@ai-sdk/google`, Zod at
every boundary, `motion` + GSAP + `three` for the landing page.

## The approach

> **The model supplies language and judgement. The tools supply facts.**

A language model is the best source for what a place feels like and what an ambiguous sentence meant,
and the worst source for what a room costs tonight. Almost every decision here follows from that.

So nothing is seeded — no fixture cities, no fallback price table, no placeholder weather. Every
number on screen was measured or quoted by a real provider, and a source that can't answer produces an
omission rather than an estimate.

| Surface           | Where it comes from                        | Key           |
| ----------------- | ------------------------------------------ | ------------- |
| Climate           | Open-Meteo geocoder + ERA5 archive         | none          |
| Photos            | Wikimedia Commons via the Wikipedia API    | none          |
| Stays, activities | Google Hotels / local / top sights         | `SERPAPI_KEY` |
| Fares             | Google Flights                             | `SERPAPI_KEY` |
| Shortlist         | the model proposes, the three above verify | both          |
| Cultural tips     | the model's own knowledge, said plainly    | Gemini        |

The model is also kept out of anything where a plausible wrong answer is indistinguishable from a
right one: sequencing the interview, ranking destinations, defining "warm", and every piece of
arithmetic. "Warm" has one definition in
[`weather/descriptors.ts`](src/features/weather/descriptors.ts), shared by the ranker and the cards so
they can't disagree, and totals are computed from provider figures in
[`travel/costs.ts`](src/features/travel/costs.ts).

## How the conversation works

Server-driven, not prompt-driven. "Ask one question at a time" mostly works, and mostly isn't good
enough: the model asks three at once, or starts planning on a half-filled brief. So the server owns
the sequence and the model only writes the wording and reads the answers.

Each turn, `/api/chat` does three things in a fixed order
([`agent/turn.ts`](src/features/agent/turn.ts)):

1. **Extract** — one structured pass that fills in every field the reply mentioned, not just the one
   the question asked about.
2. **Advance** — the state machine in [`trip/flow.ts`](src/features/trip/flow.ts) decides whether that
   answered the question, marks every other step now answerable, and returns the first still open.
3. **Write** — stream one question, or hand off to the planning agent if the brief is complete.

The server plans from a typed `TripBrief`, not the transcript. It streams back each turn as a
`data-brief` part, so the progress dots and chips derive from the same state the server used.

### Every preference gets its own typed field

A value with no field of its own gets stuffed into the nearest free-text field, and then only works
when the model happens to re-read it back out later.

- **"Somewhere warm in Europe"** lived inside `destination`, re-parsed on every planning turn — which
  worked only when the preference arrived in the same message as the destination. Now a `climate`
  field with four bands.
- **"Under $2000"** landed in `extras` as prose. The ranker already knew how to score headroom against
  a ceiling; it just never got the number. Now `maxTotalUsd`.

"The model can re-derive it later" is a bug with a delay on it.

Dates are where sounding decided isn't the same as being usable: a rate exists only for specific
nights, so "five days" has no window and "next month" prices a 29-night stay. The step tracks each
half separately and asks only for the one that's missing.

## How the AI is wired in

**Extraction** ([`agent/extract.ts`](src/features/agent/extract.ts)) — one `generateObject` call per
turn at `temperature: 0`, Zod-validated. Every field is nullable, because null and empty are different
answers: letting the model fill gaps rather than report absences is how a brief acquires facts nobody
stated.

**Two models** ([`agent/provider.ts`](src/features/agent/provider.ts)) — questions and extraction go to
`gemini-flash-lite-latest`, planning to `gemini-3.6-flash`, which otherwise spends 100+ thinking tokens
deciding how to ask how many people are coming. Temperature splits the same way: 0.6 for the interview,
0.7 for the itinerary.

**Prompts** ([`agent/prompt.ts`](src/features/agent/prompt.ts)) — three, because the turns want
opposite behaviour: ask exactly one thing, or call six tools then write at length, or propose
candidates you haven't verified. Composed from named blocks (`PERSONA`, `HONESTY`, `WEATHER_HONESTY`)
so a rule is written once and can't drift between them.

They're oddly specific because the general ones got worked around. "Never invent a price" was already
in the prompt when the planner produced "Tegallalang Rice Terrace (estimated $3 entry)" for a place
with no listed price — an older rule had asked for costs "labelled as estimates", and the model
concluded the label was what made a guess permissible. The cost rules now ban "total", "comes to" and
"fits" by name.

**Tools** ([`agent/tools.ts`](src/features/agent/tools.ts)) — six, Zod in and Zod out. Inputs are what
a model can reliably supply (a city, an IATA code, a date); outputs are the exact shapes the cards
render. **Tool output is the render contract**: cards never parse model text, so malformed JSON can't
reach the UI and the prose can't contradict the card beside it.

**Streaming** — one `createUIMessageStream` per request, so a one-line question and a full planning run
look identical to the client. The planning loop is capped at eight tool-call rounds; the SDK default of
one ends the run on the first tool call and never writes an itinerary. Cards read each tool call's own
lifecycle, so a band draws a skeleton as the model starts filling in the call rather than the whole
plan landing at once.

### The model proposes, the tools verify

`recommend_destinations` inverts the usual direction of a tool call: its input is four or five
candidate cities the model believes fit, and its job is to check them against the climate archive,
Google's rates and Google's sights, returning the two or three that hold up.

This replaced a hand-written file of sixteen cities. The problem wasn't accuracy but reach — the set of
places the app could suggest was a literal list, so "somewhere warm on a coast in September" could
never answer Split or Tbilisi. Knowing those are good answers is world knowledge; knowing what
September in Split costs is a measurement. So a proposal is a lookup key and nothing more: the model's
contribution survives in one field, `summary`, while every line in `reasons` comes from a number a
provider returned.

### Costs are a floor, never a total

A trip costs four things: a bed, a way there, admission, and food. There's a real source for three.
`estimate_costs` composes those and refuses to model the fourth — a per-diem would produce the number
travellers actually want, and would also be the only invented figure in the app and the one they'd
budget against.

So the design problem is making a floor impossible to mistake for a total. Excluded categories ship
inside the payload, so nothing can render the number without the list of what's missing. `unpriced` is
reported beside the sum, with free entries counted separately, because "free" and "price unknown" are
opposite facts that both contribute zero. And the budget comparison is asymmetric on purpose: a floor
above the ceiling proves the trip is over budget, a floor below it proves nothing at all, so only the
provable direction gets a boolean.

Cultural tips are the one place the model is the source, since no API reports whether you tip in Tokyo.
The boundary is drawn by kind of claim: norms and etiquette are in scope, anything checkable goes back
to the tools, and visas, safety and health are banned outright — stale training data, expensive when
wrong, and dependent on a nationality nobody asked for.

## Things that broke along the way

Each failed in the direction that looks like working software.

**Google prices a room, not a party.** A family of four came back as four real properties with every
rate `null` — Google couldn't fit them in one room and returned nothing rather than saying so. The cost
floor became entry fees alone, and since a floor under a ceiling reports headroom, a Zurich week for
four against a $900 budget reported "$682 unallocated" for a trip costing $4,264. Party size is now
asked before anything is priced, and the room multiplier travels with the figure.

**An echo is not an answer.** The extractor refused replies it read nothing from, and "nothing" meant
"did any field come back non-null". Ask a model what "hey" tells us about a trip already going to
Lisbon and it hands Lisbon back — the echo cleared the check, the step closed, and planning went
looking for a stay with no dates to price it for. A known field is only news when it comes back
_different_.

**Rain is a band, not a number.** ERA5 temperatures land within a few tenths of station normals; its
precipitation doesn't. The grid mean smears convective rain into drizzle, so counting days over 1mm
gives Denpasar 18 rainy days in July against 3 observed, while the same threshold is near-exact for
Lisbon. The app says "mostly dry" and never a figure.

## Project structure

By feature, not file type. Nothing under `app/` does anything but routing.

```
src/
  app/          routes — two pages, three API handlers
  features/     one directory per concern
  components/   shared presentational primitives
  lib/          domain-free helpers
  styles/       globals.css
```

`features/trip/` (what a brief is, and the question order) · `features/agent/` (everything
model-facing) · `features/conversation/` (chat UI and result cards) · `features/itinerary/` ·
`features/travel/` (provider interfaces, scoring, costing) · `features/serpapi/` (one transport, with
the key, pacing, retries and quota in it) · `features/weather/` · `features/photos/` ·
`features/landing/`

Two rules are enforced by tooling, because both kinds of drift happen one convenient import at a time.
`features/` may import from `components/` and `lib/` and never the reverse (an ESLint rule in
[`eslint.config.mjs`](eslint.config.mjs), alongside `import/no-cycle`). And any module holding the API
key, a system prompt or the photo rate limiters opens with `import 'server-only'`, so importing one
from a client component is a build error naming both files rather than a secret in a JS chunk.

## Configuration

- `GOOGLE_GENERATIVE_AI_API_KEY` — **required.** Free tier is 20 requests/day and a planning turn
  spends several, so expect to hit it while testing.
- `SERPAPI_KEY` — required for stays, activities, fares and shortlist rates. Without it those tools
  raise a configuration error rather than inventing results; weather and photos need no key, so a
  shortlist still ranks on real climate and simply carries no prices.
- `SCRAPINGDOG_KEY` / `SERP_VENDOR` — optional alternative vendor for stays and fares. Its fares are
  one-way only and activities still fall back to SerpApi, so a SerpApi key is worth setting anyway.
- `TRAVEL_AGENT_MODEL` / `TRAVEL_AGENT_FAST_MODEL` — optional model overrides.
- `WEATHER_NORMALS_CACHE` — optional path for caching climate normals between restarts.

`gemini-2.5-flash` and older aren't available to new API keys. To swap providers, edit
[`agent/provider.ts`](src/features/agent/provider.ts) — the only place a model is named. Keep
`@ai-sdk/google` on v3: v4 implements a newer language-model spec than `ai` v6 accepts.

## Tests and evals

Split by what's deterministic versus what's a model reading a sentence. Mixing the two gives you a
suite that costs money, fails intermittently, and gets muted within a week.

- **`npm test`** — 251 tests, pure logic, offline, ~400ms. Mostly negative assertions, since the bugs
  above are what it exists to pin shut.
- **`npm run eval`** — 60 checks against a live Gemini, asserting on downstream consequence rather than
  wording: "under $2000" must reach `maxTotalUsd` as `2000`, "around $150 a night" must not.

```bash
npm run dev / build / start
npm run verify        # format:check, lint, typecheck, deadcode, test — run before committing
npm run eval          # live model, costs quota, run on purpose
```

`tsconfig.json` is `strict` plus `noUncheckedIndexedAccess` and friends. Four of the `verify` checks
are structural rather than stylistic, because the mistakes they catch are invisible in review:
`server-only`, the layering rules, `import/no-cycle`, and knip for dead exports.
