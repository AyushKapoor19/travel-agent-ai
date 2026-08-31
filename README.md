# Wayfare — AI Travel Agent

A travel agent chatbot. You type one sentence about the trip you want, it asks a few follow-up
questions, then searches real hotels, flights and activities and gives you a day-by-day itinerary.

**Live:** [travel-agent-ai-three.vercel.app](https://travel-agent-ai-three.vercel.app/)

> **Note:** the SerpApi key behind the deployment is almost out of searches. Once it runs dry, stays,
> flights and activities come back empty and the plan is built without them. Run it locally with your
> own keys to see it work end to end.

## Getting started

Needs Node 22 — `engines` pins it, and there's an `.nvmrc` to match. The floor is really Node 20
(Tailwind v4's native binary requires it; on Node 18 npm skips it silently and you get a confusing
"Cannot find native binding" at build time), but the version is pinned rather than left open so a
new Node major can't change the build under you.

```bash
nvm use
cp .env.example .env.local   # add your Gemini and SerpApi keys
npm install
npm run dev
```

Gemini key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey), free, no card. SerpApi
key: [serpapi.com/users/sign_up](https://serpapi.com/users/sign_up), free, 250 searches a month. See
[Configuration](#configuration) for the rest.

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind v4, AI SDK v6 with `@ai-sdk/google`
(Gemini), `motion` + GSAP + `three` for the landing page.

## The one rule

**The model supplies language and judgement. The tools supply facts.**

A language model is the best available source for what a place feels like, and for reading an
ambiguous sentence. It's the worst available source for what a room costs tonight. Almost every
design decision here follows from drawing that line and then not crossing it when it's inconvenient.

So: nothing is seeded. Every number in the UI was measured or quoted by a real provider, and there's
no fallback table behind any of them. A source that can't answer produces an omission, not an
estimate.

| Surface           | Source                                     | Key           |
| ----------------- | ------------------------------------------ | ------------- |
| Climate           | Open-Meteo geocoder + ERA5 archive         | none          |
| Photos            | Wikimedia Commons via the Wikipedia API    | none          |
| Stays, activities | Google Hotels / local / top sights         | `SERPAPI_KEY` |
| Fares             | Google Flights                             | `SERPAPI_KEY` |
| Shortlist         | the model proposes, the three above verify | both          |
| Cultural insight  | the model's own knowledge, said so plainly | Gemini        |

## How the conversation works

The conversation is **server-driven**, not prompt-driven. Telling a model "ask one question at a
time" doesn't reliably work — it asks three at once or skips ahead. So the server owns the sequence
and the model only writes the wording and reads the answers.

Each turn, `/api/chat`:

1. Runs one structured extraction pass over the reply and fills in every field it mentioned. Answer
   three questions in one sentence and all three get captured.
2. Asks the state machine in `src/features/trip/flow.ts` for the first unanswered step.
3. Either streams exactly one question, or — if the brief is complete — hands off to the agent, which
   calls the search tools and writes the itinerary from what they return.

The context is a typed `TripBrief`, not the transcript. It streams back to the client each turn as a
`data-brief` part, so the progress dots and quick-reply chips are derived from the same state the
server planned with instead of a second copy that can disagree.

### Every preference gets its own typed field

This is the lesson worth carrying to anything you add. A value with no field of its own gets stuffed
into whichever free-text field is nearest, and then only works when the model happens to re-read it
back out later. Two cases:

- "Somewhere warm in Europe" used to live whole in `destination`, and the planning turn re-parsed
  "warm" out of that string each time. It worked, and only when the preference arrived in the same
  message as the destination. It's now a `climate` field with four bands.
- "Under $2000" landed in `extras` as prose. The ranker already knew how to score against a budget
  ceiling — it just never got the number. It's now `maxTotalUsd`, and giving a figure satisfies the
  budget step outright instead of also asking you to pick low/medium/high.

"The model can just re-derive it" is a bug with a delay on it.

Dates are the field where sounding decided isn't the same as being usable. Rates only exist for
specific nights, so "five days" and "next month" are both incomplete — the first has no window, the
second resolves to the whole month and prices a 29-night stay. The step checks which half is missing
and asks only for that.

## AI integration

**Extraction** (`features/agent/extract.ts`) — one structured pass per turn at `temperature: 0`, via
`generateObject` so output is Zod-validated and either conforms or throws. Every field is nullable,
so the model reports what the message actually said rather than filling gaps. Null and empty are
different answers, and conflating them is how a brief acquires facts nobody stated.

**Prompts** (`features/agent/prompt.ts`) — three prompts, not one, because the turns want opposite
behaviour: a question turn asks exactly one thing, a planning turn calls tools first then writes at
length, a shortlist turn proposes candidates it hasn't verified yet. Composed from named blocks
(`PERSONA`, `HONESTY`, `WEATHER_HONESTY`, `SHORTLIST_RULES`) so a rule is written once and can't drift.

The honesty rules are oddly specific because general ones got worked around. "Never invent a price"
was already in the prompt when the planner produced "Tegallalang Rice Terrace (estimated $3 entry)"
for a place with no listed price — older rules asked for rough costs "labelled as estimates", and the
model decided the label was what made a guess permissible. So the rule now names the workaround
directly. The cost rules ban the words "total", "comes to" and "fits", because those were the exact
phrasings a floor kept getting described with.

**Tools** (`features/agent/tools.ts`) — six, Zod in and Zod out: `recommend_destinations`,
`get_weather`, `search_hotels`, `search_activities`, `search_flights`, `estimate_costs`.

Tool output is the render contract. Cards are built from validated tool output, never from parsing
model text, so bad JSON can't reach the UI and the prose can't disagree with the card beside it. The
system prompt also forbids naming any stay or activity that didn't come from a tool result, which is
why itinerary prices always match the cards.

**Where the model is deliberately not used:** sequencing the interview, ranking destinations, deciding
what counts as warm, and every piece of arithmetic. Ranking is a scored function over measured inputs
in `destinations.ts`, "warm" is one definition in `descriptors.ts` shared by the ranker and the cards,
and totals are computed in `costs.ts` from provider figures.

### The model proposes, the tools verify

`recommend_destinations` inverts the usual direction. Its input is four or five candidate cities the
model believes fit; its job is to check them against the climate archive, Google's rates and Google's
sights.

That replaced a file of sixteen hand-typed cities. The problem wasn't accuracy, it was reach: the set
of places the app could ever suggest was a literal list, so "somewhere warm on a coast in September"
could never answer Split or Tbilisi. Knowing those are good answers is world knowledge and the model
has far more of it than we could type. Knowing what September in Split costs is a measurement, and the
model has no business supplying it.

So a proposal is a lookup key and nothing more. The model's contribution survives in exactly one field
— `summary` — while every line in `reasons` comes from a number a provider returned. Candidates get
dropped rather than described if the geocoder can't find them (may be invented) or if their measured
highs contradict what was asked for. Ask for five, expect three.

### Costs: a floor, never a total

A trip costs four things — a bed, a way there, admission, and food. There's a real source for three.
`estimate_costs` composes those and refuses to model the fourth. A per-diem for meals and taxis would
produce the number travellers actually want, and it would also be the only invented figure in the app
and the one they'd budget against.

So the tool returns a floor, and the design is about making a floor impossible to mistake for a total:
excluded categories ship **inside the payload** so nothing can render the number without the list of
what's missing; `unpriced` is reported beside the sum, with free entries counted separately because
"free" and "unknown" are opposite facts that both contribute zero; and the budget comparison is
asymmetric on purpose, because the arithmetic is. A floor above the ceiling proves the trip is over
budget. A floor below it proves nothing. Only the provable direction gets a boolean.

### Cultural insight, the one place the model is the source

There's no API for whether to tip in Tokyo. The model genuinely knows it and travellers want it, so
refusing would be false modesty. The boundary is drawn by **kind of claim**, not by source: norms,
etiquette and rhythms are in scope; anything presenting as a checkable fact (prices, hours, travel
times) goes back to the tools. Visas, safety and health rules are banned outright — that's where the
model is stale and confidently wrong, where being wrong costs someone their trip, and where the answer
depends on a nationality nobody asked for. The prompt points at the official source instead.

## Bugs worth knowing about

Every one of these failed in the direction that looks like working software, which is why they're
documented rather than just fixed.

**Google prices a room, not a party.** A family of four came back as four real properties with every
rate null — Google couldn't fit them in one room and said nothing rather than saying that. The cost
floor quietly became entry fees alone, and since a floor under a ceiling reports headroom, a Zurich
week for four against a $900 budget came back as "$682 unallocated" when the trip actually costs
$4,264. Being wrong in the reassuring direction is the expensive way to be wrong about money. Now the
whole party is asked about first, and the fallback multiplier travels with the figure as `rooms`.

**Only the geocoder's spelling goes downstream.** A model proposing Sicily writes "Siracusa"; the
geocoder answers "Syracuse". Google Hotels returns that city for either spelling but quotes rates only
for the English one, and English Wikipedia has no "Siracusa" article, so the photo search settled on
"Siracusa lemon" and put citrus fruit on the card. One resolved name fixed both.

**A ranking is not a failure, and a failure is not an outage.** `rejected` used to include candidates
that verified perfectly well and placed fourth, so the model explained a ranking as a data problem. One
layer down, "unmappable" and "the archive didn't answer" were both just an absent climate — so the day
Open-Meteo's quota ran out mid-testing, a shortlist rejected Rome, Athens and Lisbon as unplaceable
names, and the model wrote that they "could not be verified against live system records". That reads as
doubt about Rome and was actually a fact about our afternoon.

**A country hint has to be read generously.** The geocoder returns "Republic of Türkiye"; a model
writes "Turkey". String comparison dropped every Turkish city as unverifiable, including through
`get_weather`, so asking about any of them returned no climate at all and the honest fallback fired for
a place with ten years of observations. `lib/countries.ts` now compares the set of names a country
answers to.

**An echo is not an answer.** The extractor refused replies it read nothing from, and "nothing" meant
"did any field come back non-null". Asked what "hey" tells us about a trip already going to Lisbon, the
model hands Lisbon back. The echo cleared the check, the step closed, and the planning turn went
looking for a stay with no dates to price it for. A disclosed field is now only news when it comes back
_different_.

**Rain is a band, not a number.** ERA5 temperatures land within a few tenths of station normals; its
precipitation doesn't. The grid mean smears convective rain into drizzle, so counting days over 1mm
gives Denpasar 18 rainy days in July against 3 observed, while the same threshold is near-exact for
Lisbon. The app says "mostly dry" and never a figure.

## Structure

Organised by feature, not file type. Nothing under `app/` does anything but routing.

```
src/
  app/          routes — two pages, three API handlers
  features/     one directory per concern
  components/   shared presentational primitives
  lib/          domain-free helpers
  styles/       globals.css
```

`features/trip/` (what a brief is, and the question order) · `features/agent/` (everything
model-facing) · `features/conversation/` (the chat UI) · `features/itinerary/` ·
`features/travel/` (provider interfaces) · `features/serpapi/` (one transport, key, pacing, retries,
quota) · `features/weather/` · `features/photos/` · `features/landing/`

The dependency rule is one-way — `features/` may import from `components/` and `lib/`, never the
reverse — and it's an ESLint rule rather than an intention, because that drift happens one convenient
import at a time.

Modules holding the API key, a system prompt, or the photo rate limiters open with
`import 'server-only'`, so importing one from a client component is a build error naming both files
rather than a secret in a JS chunk.

The landing page (three scroller panels, the WebGL globe, the two-tone palette, the hand-off to
`/chat`) is self-contained in `features/landing/` and `components/panels/`. There's no `dark:` variant
anywhere — every colour resolves through a custom property, so `data-tone="night"` on a section
redeclares the palette and everything inside follows.

## Configuration

- `GOOGLE_GENERATIVE_AI_API_KEY` — required. Free tier is 20 requests/day for `gemini-3.6-flash` and a
  planning turn spends several, so expect to hit it while testing.
- `SERPAPI_KEY` — required for stays, activities, fares and shortlist rates. Without it those tools
  raise a configuration error rather than inventing results. Weather and photos need no key, so a
  shortlist still ranks on real climate and just carries no prices.
- `SCRAPINGDOG_KEY` / `SERP_VENDOR` — optional alternative vendor for stays and fares. Fares are
  one-way only and activities fall back to SerpApi, so a SerpApi key is still worth setting.
- `TRAVEL_AGENT_MODEL` — optional, defaults to `gemini-3.6-flash`.
- `TRAVEL_AGENT_FAST_MODEL` — optional, for interview questions and extraction where a reasoning pass
  only adds latency. Defaults to `gemini-flash-lite-latest`.

`gemini-2.5-flash` and older aren't available to new API keys. To swap providers, edit
`features/agent/provider.ts` — it's the only place a model is named. Keep `@ai-sdk/google` on v3; v4
implements a newer language-model spec than `ai` v6 accepts.

## Tests and evals

Split along the line that matters: what's deterministic vs. what's a model reading a sentence. Mixing
them gives you a suite that costs money, fails intermittently, and gets muted.

- **`npm test`** — 239 tests over pure logic, offline, ~400ms. Mostly negative assertions, since the
  bugs above are what it exists to pin shut.
- **`npm run eval`** — 59 checks over 29 sentences against a live Gemini. Assertions are about
  downstream consequence rather than string equality: whether the model writes "Europe" or "somewhere
  in Europe" changes nothing, but whether "under $2000" reaches `maxTotalUsd` as `2000` decides whether
  the budget is visible to the ranking at all. The negatives carry the weight — "around $150 a night"
  must not become a whole-trip ceiling, and naming Reykjavík must not be read as asking for cold.

```bash
npm run dev / build / start
npm run verify        # format:check, lint, typecheck, deadcode, test — run before committing
npm run eval          # live model, costs quota, run on purpose
```

`tsconfig.json` is `strict` plus `noUncheckedIndexedAccess` and friends. Four checks are structural
rather than stylistic, because the mistakes they catch are invisible in review: `server-only`, the
layering rules in `eslint.config.mjs`, `import/no-cycle`, and knip.
