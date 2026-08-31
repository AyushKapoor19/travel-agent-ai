# Wayfare — AI Travel Agent

Wayfare is a travel-agent chatbot. You say one sentence about the trip you want, it asks a few
follow-up questions, and then it looks up real hotels, real fares, real things to do and ten years of
real weather before writing a day-by-day itinerary out of what it found.

**Live:** [travel-agent-ai-three.vercel.app](https://travel-agent-ai-three.vercel.app/)

> The deployment runs on the free tier of both APIs — Gemini allows 20 requests a day and a single
> planning turn spends several — so a shared link runs out of quota long before it runs out of
> interest. Running it locally with your own keys is the only way to see it end to end.

## What it can do

- **Reads whatever you give it.** "Two of us in Tokyo for a week in April, mid-range, we're mostly
  here for the food" answers five of the seven intake questions at once, and it asks only the two
  that are left.
- **Interviews you one question at a time** — destination, origin, dates, budget, style, who's
  coming, anything else — with quick-reply chips and a progress meter. Answered questions never come
  back, and the optional ones can be declined without that counting as a failure to answer.
- **Picks the destination if you'd rather it did.** "Surprise me" or "somewhere warm in Europe" gets
  you a shortlist of two or three verified places instead of an itinerary: the model proposes four or
  five, and the code geocodes each one, measures its climate for your month, prices real rooms for
  your dates and looks up the sights actually listed there.
- **Plans the trip.** A day-by-day itinerary plus the evidence behind it as cards — the month's
  climate against the rest of the year, hotels with the rate Google is quoting for your dates,
  activities with ratings and entry prices, fares with Google's verdict on whether they're high for
  the route, a cost floor against your budget, and a photo per day.
- **Takes follow-ups.** "What about April instead", "swap Tuesday for something indoors". It re-runs
  the tools it needs and writes only what changed, underneath the plan — the itinerary you were
  reading stays where it is.

## Running it locally

Node 22: `engines` pins it and there's an `.nvmrc` to match. Node 20 is the real floor, since Tailwind
v4's native binary needs it.

```bash
nvm use
cp .env.example .env.local   # add your Gemini and SerpApi keys
npm install
npm run dev
```

Gemini key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — free, no card. SerpApi
key: [serpapi.com/users/sign_up](https://serpapi.com/users/sign_up) — free, 250 searches a month.
[Configuration](#configuration) covers the optional ones.

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind v4, AI SDK v6 with `@ai-sdk/google` (Gemini),
Zod at every boundary, and `motion` + GSAP + `three` for the landing page.

## The approach

> **The model supplies language and judgement. The tools supply facts.**

A language model is the best source available for what a place feels like, which cities are worth
considering in September, and what an ambiguous sentence meant. It is the worst source available for
what a room costs tonight. Almost every decision here is an application of that, including the
inconvenient ones.

So nothing is seeded: no fixture file of cities, no fallback price table, no placeholder weather.
Every number on screen was measured or quoted by a real provider, and a source that can't answer
produces an omission rather than an estimate.

| Surface           | Where it comes from                        | Key           |
| ----------------- | ------------------------------------------ | ------------- |
| Climate           | Open-Meteo geocoder + ERA5 archive         | none          |
| Photos            | Wikimedia Commons via the Wikipedia API    | none          |
| Stays, activities | Google Hotels / local / top sights         | `SERPAPI_KEY` |
| Fares             | Google Flights                             | `SERPAPI_KEY` |
| Shortlist         | the model proposes, the three above verify | both          |
| Cultural tips     | the model's own knowledge, said plainly    | Gemini        |

## How the conversation works

Server-driven, not prompt-driven, and that was the first thing I changed after trying it the obvious
way. Telling a model "ask one question at a time and don't skip ahead" mostly works, and mostly isn't
good enough: it asks three at once, or starts planning on a half-filled brief. So the server owns the
sequence and the model only writes the wording and reads the answers.

Each turn, `/api/chat` does three things in a fixed order
([`agent/turn.ts`](src/features/agent/turn.ts)):

1. **Extract** — one structured pass over the reply that fills in every field it mentioned, not just
   the one the question asked about.
2. **Advance** — the state machine in [`trip/flow.ts`](src/features/trip/flow.ts) decides whether that
   answered the question, marks every other step the brief can now answer, and returns the first one
   still outstanding.
3. **Write** — stream exactly one question, or, if the brief is complete, hand off to the agent.

The context the server plans with is a typed `TripBrief`, not the transcript. It streams back to the
client each turn as a `data-brief` part, so the progress dots and the chips derive from the same state
the server used rather than a second copy that can drift.

### Every preference gets its own typed field

The lesson I'd carry to anything else built this way. A value with no field of its own gets stuffed
into whichever free-text field is nearest, and then only works when the model happens to re-read it
back out later.

- **"Somewhere warm in Europe"** used to live inside `destination`, and the planning turn re-parsed
  "warm" out of that string each time. That worked, and only when the preference arrived in the same
  message as the destination. It's now a `climate` field with four bands.
- **"Under $2000"** landed in `extras` as prose. The ranker already knew how to score headroom against
  a ceiling; it just never got the number. It's now `maxTotalUsd`.

"The model can just re-derive it later" is a bug with a delay on it.

Dates are where sounding decided isn't the same as being usable: a rate only exists for specific
nights, so "five days" has no window and "next month" prices a 29-night stay. The step works out which
half is missing and asks for only that half.

## How the AI is wired in

**Extraction** ([`agent/extract.ts`](src/features/agent/extract.ts)) — one `generateObject` call per
turn at `temperature: 0`, Zod-validated, so it either conforms or throws. Every field is nullable:
null and empty are different answers, and letting the model fill gaps rather than report absences is
how a brief acquires facts nobody stated.

**Two models** ([`agent/provider.ts`](src/features/agent/provider.ts)) — questions and extraction go
to `gemini-flash-lite-latest`, planning to `gemini-3.6-flash`. Those turns are short and mechanical,
and the reasoning model spends 100+ thinking tokens deciding how to ask how many people are coming.
Temperature splits the same way: 0.6 for the interview, 0.7 for the itinerary, the one turn meant to
read as written rather than generated.

**Prompts** ([`agent/prompt.ts`](src/features/agent/prompt.ts)) — three rather than one, because the
turns want opposite behaviour: a question turn asks exactly one thing, a planning turn calls six tools
then writes at length, a shortlist turn proposes candidates it hasn't verified. Composed from named
blocks (`PERSONA`, `HONESTY`, `WEATHER_HONESTY`, `SHORTLIST_RULES`) so a rule is written once and
can't drift between them.

The honesty rules are oddly specific because the general ones got worked around. "Never invent a
price" was already in the prompt when the planner produced "Tegallalang Rice Terrace (estimated $3
entry)" for a place with no listed price — an older rule had asked for rough costs "labelled as
estimates", and the model concluded that the label was what made a guess permissible. The cost rules
now ban the words "total", "comes to" and "fits", because those were the exact phrasings a floor kept
getting described with.

**Tools** ([`agent/tools.ts`](src/features/agent/tools.ts)) — six, Zod in and Zod out. Inputs are what
a model can reliably supply (a city, an IATA code, a date); outputs are the exact shapes the cards
render. **Tool output is the render contract**: cards are built from validated tool output and never
from parsing the model's text, so malformed JSON can't reach the UI and the prose can't contradict the
card beside it. The prompt also forbids naming any stay or activity that didn't come from a tool
result, which is why the prices in the itinerary match the prices on the cards.

**Streaming** — one `createUIMessageStream` per request with the turn merged into it, so a one-line
question and a full planning run look the same to the client. The planning turn is an agent loop
capped at eight tool-call rounds; the SDK's default of one ends the run on the first tool call and
never writes an itinerary. Cards read each tool call's own lifecycle, so a band draws a skeleton as
soon as the model starts filling in the call rather than the whole plan landing at once.

### Where I deliberately don't use the model

Sequencing the interview, ranking destinations, defining "warm", and every piece of arithmetic.
Ranking is a scored function over measured inputs in
[`travel/destinations.ts`](src/features/travel/destinations.ts); "warm" has one definition in
[`weather/descriptors.ts`](src/features/weather/descriptors.ts), shared by the ranker and the cards so
they can't disagree; totals are computed in [`travel/costs.ts`](src/features/travel/costs.ts) from
provider figures. None of these are things a model does badly by accident — they're things where a
plausible wrong answer is indistinguishable from a right one.

### The model proposes, the tools verify

`recommend_destinations` inverts the usual direction of a tool call: its input is four or five
candidate cities the model believes fit, and its job is to check them against the climate archive,
Google's rates and Google's sights and return the two or three that hold up.

This replaced a hand-written file of sixteen cities. The problem wasn't accuracy, it was reach — the
set of places the app could ever suggest was a literal list, so "somewhere warm on a coast in
September" could never answer Split or Tbilisi. Knowing those are good answers is world knowledge, and
the model has far more of it than I could type. Knowing what September in Split costs is a
measurement, and the model has no business supplying it.

So a proposal is a lookup key and nothing more. The model's contribution survives in one field —
`summary` — while every line in `reasons` comes from a number a provider returned. Candidates are
dropped rather than described if the geocoder can't place them or if their measured highs contradict
the weather asked for. Ask for five, expect three.

### Costs are a floor, never a total

A trip costs four things: a bed, a way there, admission, and food. There's a real source for three.
`estimate_costs` composes those and refuses to model the fourth — a per-diem for meals and taxis would
produce the number travellers actually want, and would also be the only invented figure in the app and
the one they'd budget against.

So the design problem is making a floor impossible to mistake for a total. The excluded categories
ship inside the payload, so nothing can render the number without the list of what's missing.
`unpriced` is reported beside the sum, with free entries counted separately, because "free" and "price
unknown" are opposite facts that both contribute zero. And the budget comparison is asymmetric on
purpose, because the arithmetic is: a floor above the ceiling proves the trip is over budget, a floor
below it proves nothing at all, so only the provable direction gets a boolean.

### Cultural tips: the one place the model is the source

There's no API for whether to tip in Tokyo. The model genuinely knows it, travellers want it, and
refusing would be false modesty. So the boundary is drawn by kind of claim rather than by source:
norms, etiquette and daily rhythms are in scope, while anything presenting as a checkable fact —
prices, opening hours, travel times — goes back to the tools. Visas, safety and health rules are
banned outright, because that's where the model's training data is staler than the rule, where being
confidently wrong costs someone their trip, and where the answer depends on a nationality nobody
asked for.

## Things that broke along the way

Keeping these in because every one of them failed in the direction that looks like working software,
which is the failure mode worth designing against.

**Google prices a room, not a party.** A family of four came back as four real properties with every
rate `null` — Google couldn't fit them in one room and returned nothing rather than saying so. The
cost floor quietly became entry fees alone, and since a floor under a ceiling reports headroom, a
Zurich week for four against a $900 budget came back as "$682 unallocated" when the trip actually
costs $4,264. Party size is now asked before anything is priced, and the room multiplier travels with
the figure so the card can say "across two rooms".

**Only the geocoder's spelling goes downstream.** A model proposing Sicily writes "Siracusa"; the
geocoder answers "Syracuse". Google Hotels quotes rates only for the English spelling, and English
Wikipedia has no "Siracusa" article, so the photo search drifted to "Siracusa lemon" and put citrus
fruit on the destination card. One canonical name fixed both.

**A ranking is not a failure, and a failure is not an outage.** `rejected` used to hold every candidate
that didn't come back, including the ones that verified fine and placed fourth — so the model explained
a ranking as a data problem. A layer down, "couldn't place this name" and "the archive didn't answer"
were both just an absent climate, so the afternoon Open-Meteo's quota ran out the shortlist rejected
Rome, Athens and Lisbon as unplaceable names. That reads as doubt about Rome; it was a fact about our
afternoon.

**A country hint has to be read generously.** The geocoder returns "Republic of Türkiye"; the model
writes "Turkey". A string comparison dropped every Turkish city as unverifiable, so asking about any of
them returned no climate at all and the honest fallback fired for a place with ten years of
observations. `lib/countries.ts` now compares the set of names a country answers to.

**An echo is not an answer.** The extractor refused replies it read nothing from, and "nothing" meant
"did any field come back non-null". Ask a model what "hey" tells us about a trip already going to
Lisbon and it hands Lisbon back — the echo cleared the check, the step closed, and the planning turn
went looking for a stay with no dates to price it for. A known field is only news when it comes back
_different_.

**Rain is a band, not a number.** ERA5 temperatures land within a few tenths of station normals; its
precipitation doesn't. The grid mean smears convective rain into drizzle, so counting days over 1mm
gives Denpasar 18 rainy days in July against 3 observed, while the same threshold is near-exact for
Lisbon. The app says "mostly dry" and never a figure.

## Project structure

Organised by feature, not by file type. Nothing under `app/` does anything but routing.

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

Two rules are enforced by tooling rather than intended, because both kinds of drift happen one
convenient import at a time: `features/` may import from `components/` and `lib/` and never the
reverse (an ESLint rule in [`eslint.config.mjs`](eslint.config.mjs), alongside `import/no-cycle`), and
any module holding the API key, a system prompt or the photo rate limiters opens with
`import 'server-only'`, so importing one from a client component is a build error naming both files
rather than a secret in a JS chunk.

## Configuration

- `GOOGLE_GENERATIVE_AI_API_KEY` — **required.** The free tier is 20 requests/day for
  `gemini-3.6-flash` and a planning turn spends several, so expect to hit it while testing.
- `SERPAPI_KEY` — required for stays, activities, fares and shortlist rates. Without it those tools
  raise a configuration error rather than inventing results. Weather and photos need no key, so a
  shortlist still ranks on real climate and simply carries no prices.
- `SCRAPINGDOG_KEY` / `SERP_VENDOR` — optional alternative vendor for stays and fares. Its fares are
  one-way only and activities still fall back to SerpApi, so a SerpApi key is worth setting anyway.
- `TRAVEL_AGENT_MODEL` — optional, defaults to `gemini-3.6-flash`.
- `TRAVEL_AGENT_FAST_MODEL` — optional, defaults to `gemini-flash-lite-latest`.
- `WEATHER_NORMALS_CACHE` — optional path for caching climate normals between restarts.

`gemini-2.5-flash` and older aren't available to new API keys. To swap providers, edit
[`agent/provider.ts`](src/features/agent/provider.ts) — it's the only place a model is named. Keep
`@ai-sdk/google` on v3: v4 implements a newer language-model spec than `ai` v6 accepts.

## Tests and evals

Split along the line that matters — what's deterministic, versus what's a model reading a sentence.
Mixing the two gives you a suite that costs money, fails intermittently, and gets muted within a week.

- **`npm test`** — 241 tests across 21 files, pure logic, offline, ~400ms. Mostly negative assertions,
  since the bugs above are what it exists to pin shut.
- **`npm run eval`** — 60 checks over 29 sentences against a live Gemini, asserting on downstream
  consequence rather than string equality: whether the model writes "Europe" or "somewhere in Europe"
  changes nothing, but whether "under $2000" reaches `maxTotalUsd` as `2000` decides whether the
  budget is visible to the ranking at all. The first three cases are the brief's example sentences,
  verbatim. The negatives carry the weight — "around $150 a night" must not become a whole-trip
  ceiling, and naming Reykjavík must not be read as asking for cold.

```bash
npm run dev / build / start
npm run verify        # format:check, lint, typecheck, deadcode, test — run before committing
npm run eval          # live model, costs quota, run on purpose
```

`tsconfig.json` is `strict` plus `noUncheckedIndexedAccess` and friends. Four of the `verify` checks
are structural rather than stylistic, because the mistakes they catch are invisible in review:
`server-only`, the layering rules, `import/no-cycle`, and knip for dead exports.

## What I'd do next

- **Meals and local transport.** The floor stays a floor until there's a real source for the missing
  two categories; restaurant price levels from the activities provider would make food a measured
  range rather than a per-diem guess.
- **Bookable hand-off.** Links go to a Google search today because that's where the quoted price came
  from; a real inventory API would make them deep links.
- **Caching the intake calls.** Most turns are chips coming back unchanged and could be settled
  without a model call at all, which is already how declines work.
