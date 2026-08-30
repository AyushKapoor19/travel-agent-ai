import 'server-only';

import { generateObject } from 'ai';
import { z } from 'zod';

import type { TripBrief } from '@/features/trip/brief';
import {
  BriefLimits,
  BUDGET_LEVELS,
  INTEREST_OPTIONS,
  TRAVELER_TYPES,
  TRIP_PACES,
  tripBriefSchema,
} from '@/features/trip/brief';
import type { FlowStep } from '@/features/trip/flow';
import { isDeclineReply } from '@/features/trip/flow';
import { CLIMATE_PREFERENCES } from '@/features/weather/shared';
import { todayIso } from '@/lib/format';

import { conversationModel } from './provider';
import type { UnusableKind } from './rejection';
import { MODEL_UNUSABLE_KINDS, UNUSABLE_GUIDANCE } from './rejection';

/** Zero, because this is a reading task: the same message must extract the same way twice. */
const EXTRACTION_TEMPERATURE = 0;

/** Pretty-printed so the model reads the known fields as a list, not as one line. */
const CONTEXT_JSON_INDENT = 2;

/**
 * Every field is nullable: the model reports only what this message actually
 * told us, and null means "no information", which is different from "empty".
 */
const extractionSchema = z.object({
  destination: z.string().nullable().describe('City, region or country. Null if not mentioned.'),
  origin: z
    .string()
    .nullable()
    .describe(
      'Where they are flying from, if they said: a city or an airport. "from Boston", "out of LHR". Null unless stated — never guess it from a currency, a language or the destination.',
    ),
  dates: z
    .string()
    .nullable()
    .describe("The traveler's own words about timing, e.g. 'first week of October'."),
  startDate: z
    .string()
    .nullable()
    .describe('Resolved start date as YYYY-MM-DD. Null if it cannot be determined confidently.'),
  endDate: z.string().nullable().describe('Resolved end date as YYYY-MM-DD, or null.'),
  budgetLevel: z.enum(BUDGET_LEVELS).nullable(),
  maxTotalUsd: z
    .number()
    .positive()
    .max(BriefLimits.MAX_BUDGET_USD)
    .nullable()
    .describe(
      'A ceiling for the whole trip in USD, if they named a figure: 2000 for "under $2000", 2000 for "$2k max". A nightly rate or a per-person figure is not this — leave null unless the number is a total for the trip.',
    ),
  climate: z
    .enum(CLIMATE_PREFERENCES)
    .nullable()
    .describe(
      'The weather they asked for, mapped onto one of these bands: "tropical", "beach weather" or "somewhere warm" is warm or hot; "cool", "crisp", "escape the heat" is mild or cold. Null unless they actually asked for a kind of weather — naming a place is not asking for its climate, and someone choosing Reykjavík has not requested cold.',
    ),
  interests: z
    .array(z.string())
    .nullable()
    .describe(`Zero or more of: ${INTEREST_OPTIONS.join(', ')}. Map loose wording onto these.`),
  travelerType: z.enum(TRAVELER_TYPES).nullable(),
  travelers: z
    .number()
    .int()
    .min(BriefLimits.MIN_TRAVELERS)
    .max(BriefLimits.MAX_TRAVELERS)
    .nullable()
    .describe('Head count if stated.'),
  extras: z
    .string()
    .nullable()
    .describe(
      'Must-sees, dealbreakers or pace notes. Also where a figure goes when it is a real constraint but not a whole-trip ceiling — "around $150 a night" belongs here, in their own words, since `maxTotalUsd` would misread it as the budget for everything.',
    ),
  pace: z.enum(TRIP_PACES).nullable(),
  declined: z
    .boolean()
    .describe(
      'True if the traveler declined to answer, said the question does not apply to them, said there is nothing to add, or handed the choice back to you — "surprise me", "you pick", "wherever you think", "not flying" all count.',
    ),
  /**
   * A name for what was wrong with the reply, and nothing more than a name.
   *
   * Emphatically not the decision to refuse it — that is made below, from whether
   * any field above came back non-null. This only picks which sentence the
   * traveller reads, so the model being wrong here costs a word rather than a
   * turn. The version where the model made the decision let "hey" answer all
   * seven questions.
   */
  unusable: z
    .enum(MODEL_UNUSABLE_KINDS)
    .nullable()
    .describe(
      'Set only when the reply is not an attempt at the question at all: "gibberish" for text with no meaning, "off-topic" for a coherent message about something else entirely or impossible as a trip detail. Null otherwise, and always null if you extracted any field from the reply.',
    ),
});

type Extraction = z.infer<typeof extractionSchema>;

/**
 * Declining a question cannot also answer it.
 *
 * The two readings arrive together often enough to matter: "we're driving" comes
 * back as `declined: true` *and* `origin: "driving"`, and the non-empty string wins
 * in the merge below — so the step counts as properly answered and the planning turn
 * goes looking for an airport by that name. The prompt asks for this too; this is
 * the version that cannot be talked out of it.
 *
 * Only the field the question was about is cleared. A reply is perfectly entitled to
 * decline one thing and volunteer another, and "not flying, but make it Lisbon"
 * should keep Lisbon.
 */
function clearDeclinedField(extraction: Extraction, step: FlowStep): Extraction {
  if (!extraction.declined) return extraction;

  /*
   * A refusal to a question that cannot be refused is not a refusal.
   *
   * Only four of the seven steps have a decline rule; on the other three there is
   * nothing to decline, and the model saying so is a misreading rather than an
   * answer. It does say so: "idk" to the budget question came back `declined:
   * true`, which exempted it from being handed back and told the next turn to
   * acknowledge a refusal that never happened.
   *
   * Cleared here, at the one place a decline is already interpreted against the
   * step, so nothing downstream has to know that `declined` is only meaningful on
   * some questions. `advance` had this right for its own purposes and read
   * `step.decline` before trusting the flag; everything else took it at face value.
   */
  if (!step.decline) return { ...extraction, declined: false };

  switch (step.id) {
    case 'destination':
      return { ...extraction, destination: null };
    case 'origin':
      return { ...extraction, origin: null };
    case 'extras':
      return { ...extraction, extras: null };
    default:
      return extraction;
  }
}

const EMPTY_EXTRACTION: Extraction = {
  destination: null,
  origin: null,
  dates: null,
  startDate: null,
  endDate: null,
  budgetLevel: null,
  maxTotalUsd: null,
  climate: null,
  interests: null,
  travelerType: null,
  travelers: null,
  extras: null,
  pace: null,
  declined: false,
  unusable: null,
};

/**
 * A disclosed field that came back saying something new.
 *
 * Null is not news — it is the model declining to report the field — and a value
 * matching what the brief already holds is not news either. Folded and trimmed so
 * that "lisbon" against "Lisbon" is recognised as the echo it is.
 */
function changed(reported: string | null, held: string): boolean {
  return reported !== null && reported.trim().toLowerCase() !== held.trim().toLowerCase();
}

/**
 * Whether the reply contained a single thing worth writing down.
 *
 * The whole test, and the reason this version works where the last one did not.
 * The question is not whether a message was strange — "hey" is not strange, and it
 * answered all seven questions — but whether reading it produced anything.
 *
 * The subtlety, and it cost a round of failing evals: an empty reply does not
 * produce an empty reading. Asked what "hey" tells us about a trip already known
 * to be going to Lisbon, the model dutifully hands Lisbon back, because it is
 * shown the brief as context and repeating it is not obviously wrong. The prompt
 * asks it not to and it does anyway.
 *
 * So the fields we disclosed are only news when they come back *different*, while
 * the fields we never mentioned are news whenever they come back at all. That
 * split is not a heuristic: a value the model was never shown cannot be an echo of
 * it, and one it was shown might be nothing else. It is also what saves the
 * commonest answer in travel — `travelers` is deliberately kept out of the context
 * below, so a couple replying "just the two of us" reports 2 against a brief that
 * already said 2, and is correctly read as having answered.
 */
function reportedAnything(extraction: Extraction, brief: TripBrief): boolean {
  // Never disclosed, so any value at all was read out of the message.
  if (
    extraction.travelers !== null ||
    extraction.pace !== null ||
    extraction.extras !== null ||
    extraction.startDate !== null ||
    extraction.endDate !== null
  ) {
    return true;
  }

  // Disclosed as context, so only a change counts.
  if (changed(extraction.destination, brief.destination)) return true;
  if (changed(extraction.origin, brief.origin)) return true;
  if (changed(extraction.dates, brief.dates)) return true;
  if (changed(extraction.budgetLevel, brief.budgetLevel)) return true;
  if (changed(extraction.climate, brief.climate)) return true;
  if (changed(extraction.travelerType, brief.travelerType)) return true;
  if (extraction.maxTotalUsd !== null && extraction.maxTotalUsd !== brief.maxTotalUsd) return true;

  const known = new Set(brief.interests.map((interest) => interest.toLowerCase()));
  return (extraction.interests ?? []).some((interest) => !known.has(interest.toLowerCase()));
}

export type Extracted = {
  brief: TripBrief;
  declined: boolean;
  /** Set when the reply was not an attempt at the question, and taught us nothing. */
  unusable: UnusableKind | null;
};

/**
 * Reads whatever the message reveals into the brief.
 *
 * Deliberately opportunistic: if the traveler answers three questions in one
 * sentence we keep all three, and the state machine skips those steps rather
 * than asking again. The model never decides what to ask next.
 */
export async function extractBrief(
  brief: TripBrief,
  step: FlowStep,
  userMessage: string,
): Promise<Extracted> {
  /*
   * A pressed chip is settled before the model is consulted.
   *
   * It is one of this app's own strings arriving back unchanged, it carries nothing
   * else to read, and treating it as a sentence to be interpreted is what turned
   * "Not flying" into a reply that had failed to name an airport. Answering it here
   * also makes the skip free and instant, and keeps the button working on the turn
   * the inference call is the thing that breaks.
   */
  if (isDeclineReply(step, userMessage)) {
    return { brief, declined: true, unusable: null };
  }

  let extraction = EMPTY_EXTRACTION;
  /*
   * Whether the model was reached at all, which decides what an empty reading means.
   *
   * The two look identical from the outside — thirteen nulls either way — and they
   * call for opposite responses. A model that read the message and found nothing has
   * told us something about the message. A model that never answered has told us
   * about our own quota, and refusing the traveller's perfectly good sentence over it
   * would be blaming them for our outage.
   */
  let unreachable = false;

  try {
    const result = await generateObject({
      model: conversationModel(),
      schema: extractionSchema,
      temperature: EXTRACTION_TEMPERATURE,
      system: [
        "You extract structured trip details from a traveler's message.",
        `Today is ${todayIso()}. Resolve relative dates against it, and assume a future date when the year is ambiguous.`,
        'Report only what this message states or clearly implies. Use null for anything absent.',
        'Do not guess a destination from a nationality, a currency or a language.',
        // Without this the phrase itself gets recorded as the place, and the trip is
        // planned to a city called "Surprise me".
        'Handing the choice back to you is not a destination. For "surprise me", "you pick" or "anywhere nice", leave destination null and set declined true. A real region such as "Europe" or a stated preference such as "somewhere warm" is not a decline: record what they said.',
        /*
         * What "no" sounds like, for the question actually on the table.
         *
         * One generic description of declining could not carry every step: it was
         * written around "surprise me", so a reply that made a question moot rather
         * than refusing it — "not flying" — read as an ordinary answer that happened
         * to contain no airport, and the traveler got asked again.
         *
         * Scoped to the declinable steps rather than stated once as a general rule,
         * which is not a stylistic choice. Phrased generally it reached the questions
         * where nothing can be declined too, and the extra caution cost real answers:
         * "around $150 a night" stopped being recorded anywhere at all.
         */
        step.decline
          ? `Declining this question means: ${step.decline.means} When they do, leave that field null and set declined true — the refusal is never itself the answer.`
          : '',
        UNUSABLE_GUIDANCE,
      ]
        .filter(Boolean)
        .join('\n'),
      prompt: [
        `The traveler was just asked: "${step.question}"`,
        `Their reply: "${userMessage}"`,
        '',
        'Already known (do not repeat unless the reply changes it):',
        JSON.stringify(
          {
            destination: brief.destination || null,
            origin: brief.origin || null,
            dates: brief.dates || null,
            budgetLevel: brief.budgetLevel || null,
            maxTotalUsd: brief.maxTotalUsd,
            climate: brief.climate || null,
            interests: brief.interests,
            travelerType: brief.travelerType || null,
          },
          null,
          CONTEXT_JSON_INDENT,
        ),
      ].join('\n'),
    });

    extraction = clearDeclinedField(result.object, step);
  } catch {
    // Extraction is best-effort. On failure the raw reply is still recorded
    // below for the current step, so the conversation keeps moving.
    extraction = { ...EMPTY_EXTRACTION };
    unreachable = true;
  }

  const merged: TripBrief = {
    ...brief,
    destination: extraction.destination?.trim() || brief.destination,
    origin: extraction.origin?.trim() || brief.origin,
    dates: extraction.dates?.trim() || brief.dates,
    startDate: extraction.startDate?.trim() || brief.startDate,
    endDate: extraction.endDate?.trim() || brief.endDate,
    budgetLevel: extraction.budgetLevel ?? brief.budgetLevel,
    maxTotalUsd: extraction.maxTotalUsd ?? brief.maxTotalUsd,
    climate: extraction.climate ?? brief.climate,
    travelerType: extraction.travelerType ?? brief.travelerType,
    travelers: extraction.travelers ?? brief.travelers,
    extras: extraction.extras?.trim() || brief.extras,
    pace: extraction.pace ?? brief.pace,
    interests:
      extraction.interests && extraction.interests.length > 0
        ? Array.from(new Set([...brief.interests, ...extraction.interests]))
        : brief.interests,
  };

  /*
   * The reply that said nothing, handed straight back.
   *
   * Returning here rather than below the fallbacks is the entire fix. The fallbacks
   * store the traveller's raw words for the two free-text steps, and they ran on any
   * empty reading whatever its cause — so "hey" was read, found to contain nothing,
   * and then written into `dates` regardless, which marked the step answered and put
   * the word in front of the planning model as the dates of the trip.
   *
   * A decline is exempt because it is a decision rather than a blank, and an
   * unreachable model is exempt because the blank is ours rather than theirs.
   */
  if (!unreachable && !extraction.declined && !reportedAnything(extraction, brief)) {
    return { brief, declined: false, unusable: extraction.unusable ?? 'unanswered' };
  }

  /*
   * Fallback so a step is never lost to an extraction that never happened.
   *
   * Narrowed to exactly that case. It used to run whenever the field came back
   * empty, which conflated "the service is down, keep their words so nothing is
   * lost" with "we read this and there was nothing in it" — and only the first is
   * a reason to store a sentence nobody has understood.
   */
  const trimmed = userMessage.trim();
  if (unreachable && trimmed) {
    if (step.id === 'extras' && !merged.extras) {
      merged.extras = trimmed.slice(0, BriefLimits.EXTRAS);
    }
    if (step.id === 'dates' && !merged.dates) {
      merged.dates = trimmed.slice(0, BriefLimits.DATES);
    }
  }

  return {
    brief: tripBriefSchema.parse(merged),
    declined: extraction.declined,
    // Named by the model only when it also extracted nothing, which the branch above
    // has already dealt with. Reaching here with one set means it contradicted itself,
    // and the field it filled is the better evidence.
    unusable: null,
  };
}
