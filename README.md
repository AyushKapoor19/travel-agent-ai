# Wayfare — AI Travel Agent

Wayfare is a travel-agent chatbot. You say one sentence about the trip you want, it asks a few
follow-up questions, and then it goes and looks up real hotels, real fares, real things to do and ten
years of real weather before writing you a day-by-day itinerary out of what it found.

**Live:** [travel-agent-ai-three.vercel.app](https://travel-agent-ai-three.vercel.app/)

> The deployment runs on the free tier of both APIs — Gemini allows 20 requests a day and a single
> planning turn spends several — so a shared link runs out of quota long before it runs out of
> interest. Running it locally with your own keys is the only way to see it end to end.

Most of this README is about _why_ it's built the way it is rather than what's in which file. There's
one decision underneath nearly all of it — where the model's judgement ends and where measured data
has to take over — and once I'd drawn that line, most of the rest followed from refusing to cross it
when crossing it would have been easier.

## What it can do

**It reads whatever you give it.** "Two of us in Tokyo for a week in April, mid-range, we're mostly
here for the food" answers five of the seven intake questions in one sentence, and it only asks you
the two that are left. Type a single word and it'll walk you through the rest.

**It interviews you properly.** One question per turn — destination, where you're flying from, dates,
budget, what you're after, who's coming, anything else — with quick-reply chips and a progress meter.
Questions you've already answered never come back, and the optional ones (origin, extras) can be
declined without the flow treating that as a failure to answer.

**It'll pick the destination for you.** Say "surprise me", or "somewhere warm in Europe", and instead
of an itinerary you get a shortlist of two or three places that have been checked: the model proposes
four or five cities it thinks fit, and the code geocodes each one, measures its climate for your
travel month, prices real rooms for your dates and looks up the sights actually listed there. You
pick one and it builds the trip around it.

**It plans the trip.** A day-by-day itinerary with a geographically coherent shape, plus the evidence
it was written from, rendered as cards: the month's climate against the rest of the year, real hotels
with the nightly and total rate Google is quoting for your dates, activities with their ratings and
entry prices, fares with Google's own verdict on whether they're low or high for that route, a cost
floor measured against your budget, a Wikimedia photo per day, and booking links that point back at
the source the price came from.

**It takes follow-ups.** "What about April instead", "swap Tuesday for something indoors", "what would
the flights cost". It re-runs whichever tools it needs and writes only what actually changed,
underneath the plan. The original itinerary stays where it is — you never lose the trip you were
reading.

**It leaves gaps where it doesn't know.** No estimated prices, no invented travel times, no daily
food budget. If a source can't answer, the answer is missing rather than made up.

## Running it locally

You need Node 22 — `engines` pins it and there's an `.nvmrc` to match. The real floor is Node 20
(Tailwind v4's native binary needs it, and on Node 18 npm skips the binary silently and you get a
baffling "Cannot find native binding" at build time), but I pinned the major rather than leaving it
open so a new Node release can't quietly change the build.

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
Zod for every schema at every boundary, and `motion` + GSAP + `three` for the landing page.

## The approach

The rule I kept coming back to:

> **The model supplies language and judgement. The tools supply facts.**

A language model is the best source available for what a place feels like, which cities are worth
considering in September, and what an ambiguous sentence actually meant. It is the worst source
available for what a room costs tonight. Almost every design decision here is an application of that,
including the inconvenient ones.

So nothing in this app is seeded. There is no fixture file of cities, no fallback price table, no
placeholder weather. Every number on screen was measured or quoted by a real provider, and a source
that can't answer produces an omission rather than an estimate.

| Surface           | Where it comes from                        | Key           |
| ----------------- | ------------------------------------------ | ------------- |
| Climate           | Open-Meteo geocoder + ERA5 archive         | none          |
| Photos            | Wikimedia Commons via the Wikipedia API    | none          |
| Stays, activities | Google Hotels / local / top sights         | `SERPAPI_KEY` |
| Fares             | Google Flights                             | `SERPAPI_KEY` |
| Shortlist         | the model proposes, the three above verify | both          |
| Cultural tips     | the model's own knowledge, said plainly    | Gemini        |

## How the conversation works

The conversation is **server-driven, not prompt-driven**, and that was the first thing I changed after
trying it the obvious way. Telling a model "ask one question at a time and don't skip ahead" mostly
works, and mostly isn't good enough: it asks three questions at once, or decides it has enough and
starts planning on a half-filled brief. So the server owns the sequence and the model only writes the
wording and reads the answers.

Each turn, `/api/chat` does three things in a fixed order ([`features/agent/turn.ts`](src/features/agent/turn.ts)):

1. **Extract.** One structured pass over the reply that fills in every field it mentioned — not just
   the field the question asked about.
2. **Advance.** The state machine in [`features/trip/flow.ts`](src/features/trip/flow.ts) decides
   whether that answered the question, marks every _other_ step the brief can now answer, and returns
   the first one still outstanding.
3. **Write.** Either stream exactly one question, or — if the brief is complete — hand off to the
   agent, which calls the search tools and writes the itinerary from what they return.

The context the server plans with is a typed `TripBrief`, not the transcript. It streams back to the
client every turn as a `data-brief` part, so the progress dots and the quick-reply chips are derived
from the same state the server used rather than a second copy of it that can drift.

Two caps keep the flow honest in opposite directions. A misread reply gets exactly one re-ask before
the step advances anyway, so the interview can't deadlock; a genuinely unreadable reply (a keyboard
mash) gets handed back with a plain explanation up to four times, because refusing an answer is right
once and rude three times running.

### Every preference gets its own typed field

This is the lesson I'd carry to anything else built this way. A value with no field of its own gets
stuffed into whichever free-text field is nearest, and then only works when the model happens to
re-read it back out later. Two cases where it bit me:

- **"Somewhere warm in Europe"** used to live whole inside `destination`, and the planning turn
  re-parsed the word "warm" out of that string each time it needed it. That worked — and only worked
  when the preference arrived in the same message as the destination. Said one question later it had
  nowhere to go. It's now a `climate` field with four bands.
- **"Under $2000"** landed in `extras` as prose. The destination ranker already knew how to score
  headroom against a budget ceiling; it just never got the number. It's now `maxTotalUsd`, and naming
  a figure satisfies the budget step outright instead of also making you pick low/medium/high
  afterwards, which reads as not having listened.

"The model can just re-derive it later" is a bug with a delay on it.

Dates were the field where sounding decided isn't the same as being usable. A rate only exists for
specific nights, so "five days" and "next month" are both incomplete: the first has no window, the
second resolves honestly to the whole month and then prices a 29-night stay. The step works out which
half is missing and asks for only that half.

## How the AI is wired in

**Extraction** ([`features/agent/extract.ts`](src/features/agent/extract.ts)) — one `generateObject`
call per turn at `temperature: 0`, so the output is Zod-validated and either conforms or throws.
Every field is nullable, which matters more than it sounds: null and empty string are different
answers, and letting the model fill gaps rather than report absences is how a brief acquires facts
nobody stated.

**Prompts** ([`features/agent/prompt.ts`](src/features/agent/prompt.ts)) — three of them rather than
one, because the turns want opposite behaviour. A question turn asks exactly one thing and writes two
sentences; a planning turn calls six tools and then writes at length; a shortlist turn proposes
candidates it hasn't verified yet. They're composed from named blocks (`PERSONA`, `HONESTY`,
`WEATHER_HONESTY`, `SHORTLIST_RULES`, `CULTURAL_INSIGHT`) so a rule is written once and can't drift
between them.

The honesty rules are oddly specific, and that's deliberate — the general ones got worked around.
"Never invent a price" was already in the prompt when the planner produced "Tegallalang Rice Terrace
(estimated $3 entry)" for a place with no listed price. An older rule had asked for rough costs
"labelled as estimates", and the model reasonably concluded that the label was the thing that made a
guess permissible. It isn't: a traveller reading "estimated $3" believes someone estimated it. So the
rule now names that workaround directly. The cost rules go as far as banning the words "total",
"comes to" and "fits", because those were the exact phrasings a floor kept getting described with.

**Tools** ([`features/agent/tools.ts`](src/features/agent/tools.ts)) — six, Zod in and Zod out:
`recommend_destinations`, `get_weather`, `search_hotels`, `search_activities`, `search_flights`,
`estimate_costs`. Inputs are things a model can reliably supply (a city name, an IATA code, a date);
outputs are the exact shapes the cards render.

That second half is the part I'd defend hardest. **Tool output is the render contract.** Cards are
built from validated tool output and never from parsing the model's text, so malformed JSON can't
reach the UI and the prose can't contradict the card sitting next to it. The system prompt also
forbids naming any stay or activity that didn't come from a tool result, which is why the prices in
the itinerary always match the prices on the cards.

### Where I deliberately don't use the model

Sequencing the interview, ranking destinations, deciding what counts as "warm", and every piece of
arithmetic. Ranking is a scored function over measured inputs in
[`travel/destinations.ts`](src/features/travel/destinations.ts); "warm" has exactly one definition in
[`weather/descriptors.ts`](src/features/weather/descriptors.ts), shared by the ranker and the cards so
they can't disagree; totals are computed in [`travel/costs.ts`](src/features/travel/costs.ts) from
provider figures. None of these are things a model does badly by accident — they're things where a
plausible-looking wrong answer is indistinguishable from a right one.

### The model proposes, the tools verify

`recommend_destinations` inverts the usual direction of a tool call. Its _input_ is four or five
candidate cities the model believes fit; its _job_ is to check them against the climate archive,
Google's room rates and Google's sights, and hand back the two or three that hold up.

This replaced a hand-written file of sixteen cities. The problem with the file wasn't accuracy, it was
reach: the set of places the app could ever suggest was a literal list, so "somewhere warm on a coast
in September" could never answer Split or Tbilisi. Knowing those are good answers is world knowledge,
and the model has far more of it than I could type. Knowing what September in Split costs is a
measurement, and the model has no business supplying it.

So a proposal is a lookup key and nothing more. The model's own contribution survives in exactly one
field — `summary` — while every line in `reasons` comes from a number a provider returned. Candidates
get dropped rather than described if the geocoder can't place them (they may be invented) or if their
measured highs contradict the weather that was asked for. Ask for five, expect three.

### Costs are a floor, never a total

A trip costs four things: a bed, a way there, admission, and food. There's a real source for three of
them. `estimate_costs` composes those three and flatly refuses to model the fourth. A per-diem for
meals and taxis would produce the number travellers actually want — and it would also be the only
invented figure in the entire app, and the one they'd budget against.

Given that, the design problem is making a floor impossible to mistake for a total:

- The excluded categories ship **inside the payload**, so nothing can render the number without also
  rendering the list of what's missing.
- `unpriced` is reported next to the sum, with free entries counted separately, because "free" and
  "price unknown" are opposite facts that both contribute zero.
- The budget comparison is asymmetric on purpose, because the arithmetic is. A floor _above_ the
  ceiling proves the trip is over budget. A floor _below_ it proves nothing at all. Only the provable
  direction gets a boolean.

### Cultural tips: the one place the model is the source

There's no API for whether to tip in Tokyo or how loudly to talk on a Lisbon tram. The model genuinely
knows this, travellers genuinely want it, and refusing to say anything would be false modesty rather
than honesty.

So the boundary here is drawn by **kind of claim** rather than by source. Norms, etiquette and daily
rhythms are in scope. Anything that presents as a checkable fact — prices, opening hours, travel times
— goes back to the tools. Visas, safety and health rules are banned outright: that's where the model's
training data is guaranteed to be staler than the rule, where being confidently wrong costs someone
their trip, and where the correct answer depends on a nationality nobody asked for. The prompt points
at the official source instead.

## Things that broke along the way

I'm keeping these in the README rather than just fixing them quietly, because every one of them failed
in the direction that looks like working software. That's the failure mode worth designing against.

**Google prices a room, not a party.** A family of four came back as four real properties with every
rate `null` — Google couldn't fit them all in one room and returned nothing rather than saying so. The
cost floor quietly became entry fees alone, and since a floor under a ceiling reports headroom, a
Zurich week for four against a $900 budget came back as "$682 unallocated" when the trip actually
costs $4,264. Being wrong in the reassuring direction is the expensive way to be wrong about money.
The party size is now asked about before anything is priced, and the fallback multiplier travels with
the figure as `rooms` so the card can say "across two rooms".

**Only the geocoder's spelling goes downstream.** A model proposing Sicily writes "Siracusa"; the
geocoder answers "Syracuse". Google Hotels accepts either spelling but only quotes rates for the
English one, and English Wikipedia has no "Siracusa" article, so the photo search drifted to
"Siracusa lemon" and put a picture of citrus fruit on the destination card. Resolving one canonical
name and using it everywhere fixed both symptoms.

**A ranking is not a failure, and a failure is not an outage.** `rejected` used to contain every
candidate that didn't come back, which quietly included the ones that verified perfectly well and
placed fourth — so the model explained a ranking as a data problem and told a traveller that Cádiz had
failed checks it had actually passed. One layer down, "we couldn't place this name" and "the archive
didn't answer" were both just an absent climate, so the afternoon Open-Meteo's quota ran out the
shortlist rejected Rome, Athens and Lisbon as unplaceable names and the model wrote that they "could
not be verified against live system records". That reads as doubt about Rome; it was a fact about our
afternoon. The three cases are now distinct, and the prompt says which of them may be mentioned.

**A country hint has to be read generously.** The geocoder returns "Republic of Türkiye"; the model
writes "Turkey". A string comparison dropped every Turkish city as unverifiable — including through
`get_weather`, so asking about any of them returned no climate at all and the honest "couldn't confirm
the weather" fallback fired for a place with ten years of observations behind it.
[`lib/countries.ts`](src/lib/countries.ts) now compares against the set of names a country answers to.

**An echo is not an answer.** The extractor refused replies it read nothing from, and "nothing" was
implemented as "did any field come back non-null". Ask a model what "hey" tells us about a trip that's
already going to Lisbon and it hands Lisbon back. The echo cleared the check, the step closed, and the
planning turn went looking for a stay with no dates to price it for. A field that was already known
now only counts as news when it comes back _different_.

**Rain is a band, not a number.** ERA5 temperatures land within a few tenths of station normals; its
precipitation doesn't. The grid mean smears convective rain into drizzle, so counting days over 1mm
gives Denpasar 18 rainy days in July against 3 observed — while the same threshold is near-exact for
Lisbon. There's no honest threshold, so the app says "mostly dry" and never gives a figure, and the
prompt forbids converting the band back into millimetres.

## Project structure

Organised by feature rather than by file type. Nothing under `app/` does anything but routing.

```
src/
  app/          routes — two pages, three API handlers
  features/     one directory per concern
  components/   shared presentational primitives
  lib/          domain-free helpers
  styles/       globals.css
```

`features/trip/` (what a brief is, and what order the questions come in) · `features/agent/`
(everything model-facing: prompts, extraction, tools, one turn) · `features/conversation/` (the chat
UI and the result cards) · `features/itinerary/` (the plan as a document) · `features/travel/`
(provider interfaces and the scoring/costing logic) · `features/serpapi/` (one transport, with the
key, pacing, retries and quota handling in it) · `features/weather/` · `features/photos/` ·
`features/landing/`

Two structural rules are enforced rather than intended, because both kinds of drift happen one
convenient import at a time:

- `features/` may import from `components/` and `lib/`, never the reverse. That's an ESLint rule in
  [`eslint.config.mjs`](eslint.config.mjs), alongside `import/no-cycle`.
- Any module holding the API key, a system prompt or the photo rate limiters opens with
  `import 'server-only'`, so importing one from a client component is a build error naming both files
  rather than a secret in a JS chunk.

The landing page — three scroller panels, the WebGL globe, the two-tone palette, the hand-off into
`/chat` — is self-contained in `features/landing/` and `components/panels/`. There's no `dark:`
variant anywhere in the app: every colour resolves through a custom property, so `data-tone="night"`
on a section redeclares the palette and everything inside it follows.

## Configuration

- `GOOGLE_GENERATIVE_AI_API_KEY` — **required.** The free tier is 20 requests/day for
  `gemini-3.6-flash` and a planning turn spends several, so expect to hit it while testing.
- `SERPAPI_KEY` — required for stays, activities, fares and shortlist rates. Without it those tools
  raise a configuration error rather than inventing results. Weather and photos need no key, so a
  shortlist still ranks on real climate and simply carries no prices.
- `SCRAPINGDOG_KEY` / `SERP_VENDOR` — optional alternative vendor for stays and fares. Its fares are
  one-way only and activities still fall back to SerpApi, so a SerpApi key is worth setting anyway.
- `TRAVEL_AGENT_MODEL` — optional, defaults to `gemini-3.6-flash`.
- `TRAVEL_AGENT_FAST_MODEL` — optional. Used for interview questions and extraction, where a reasoning
  pass only adds latency. Defaults to `gemini-flash-lite-latest`.
- `WEATHER_NORMALS_CACHE` — optional path for caching climate normals between restarts.

`gemini-2.5-flash` and older aren't available to new API keys, which is worth knowing if you're
copying a model name out of a tutorial. To swap providers entirely, edit
[`features/agent/provider.ts`](src/features/agent/provider.ts) — it's the only place a model is named.
Keep `@ai-sdk/google` on v3: v4 implements a newer language-model spec than `ai` v6 accepts.

## Tests and evals

Split along the line that actually matters — what's deterministic, versus what's a model reading a
sentence. Mixing the two gives you a suite that costs money, fails intermittently, and gets muted
within a week.

- **`npm test`** — 241 tests across 21 files, pure logic, fully offline, ~400ms. A lot of them are
  negative assertions, because the bugs in the section above are what the suite exists to pin shut.
- **`npm run eval`** — 60 checks over 29 sentences against a live Gemini. The assertions are about
  downstream consequence rather than string equality: whether the model writes "Europe" or "somewhere
  in Europe" changes nothing, but whether "under $2000" reaches `maxTotalUsd` as `2000` decides
  whether the budget is visible to the ranking at all. The first three cases are the example sentences
  from the brief, quoted verbatim. The negatives carry most of the weight — "around $150 a night" must
  not become a whole-trip ceiling, and naming Reykjavík must not be read as asking for cold weather.

```bash
npm run dev / build / start
npm run verify        # format:check, lint, typecheck, deadcode, test — run before committing
npm run eval          # live model, costs quota, run on purpose
```

`tsconfig.json` is `strict` plus `noUncheckedIndexedAccess` and friends. Four of the checks in
`verify` are structural rather than stylistic, and they're there because the mistakes they catch are
invisible in review: `server-only`, the layering rules in `eslint.config.mjs`, `import/no-cycle`, and
knip for dead exports.

## What I'd do next

- **Meals and local transport, honestly.** The cost floor stays a floor until there's a real source
  for the missing two categories. Restaurant price levels are available from the same provider the
  activities come from, which would make food a measured range rather than a per-diem guess.
- **Bookable hand-off.** The links currently go to a Google search, because that's where the quoted
  price came from and I'd rather the reader be able to check the figure than land on a booking form
  with a different number on it. A real inventory API would let those become deep links.
- **Caching the intake model calls.** Extraction runs on every turn and most turns are chips coming
  back unchanged; those could be settled without a model call at all, which is already how declines
  work.
