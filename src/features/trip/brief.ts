import { z } from 'zod';

import { CLIMATE_PREFERENCES } from '@/features/weather/shared';
import { formatPrice } from '@/lib/format';
import { nightsBetween } from '@/lib/time';

/** Every provider here quotes USD, so a stated ceiling is read as USD too. */
export const BUDGET_CURRENCY = 'USD';

/**
 * The guided conversation's vocabulary and state.
 *
 * The field limits are exported because two other modules need the same numbers:
 * extraction truncates a free-text answer to them before handing it back, and a
 * limit that disagreed with the schema would fail the parse it was meant to
 * satisfy.
 */

export const STEP_IDS = [
  'destination',
  'origin',
  'dates',
  'budget',
  'interests',
  'travelers',
  'extras',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export const BUDGET_LEVELS = ['budget', 'mid-range', 'luxury'] as const;
export const TRAVELER_TYPES = ['solo', 'couple', 'family', 'friends'] as const;
export const TRIP_PACES = ['relaxed', 'balanced', 'packed'] as const;

export const INTEREST_OPTIONS = [
  'Food & dining',
  'History & culture',
  'Nature & hiking',
  'Beaches',
  'Nightlife',
  'Art & design',
  'Adventure sports',
  'Family friendly',
  'Relaxation',
  'Off the beaten path',
] as const;

/** Field bounds, shared with extraction so a truncated answer always parses. */
export const BriefLimits = {
  DESTINATION: 120,
  DATES: 160,
  DATE_VALUE: 40,
  INTEREST: 60,
  INTERESTS: 20,
  EXTRAS: 600,
  ANSWERED: 24,
  MIN_TRAVELERS: 1,
  MAX_TRAVELERS: 30,
  MAX_RETRIES: 5,
  MAX_REJECTIONS: 5,
  /** Generous, and only here so a misread "$200000" cannot pass through as a budget. */
  MAX_BUDGET_USD: 1_000_000,
} as const;

export const DEFAULT_TRAVELERS = 2;
const DEFAULT_PACE = 'balanced';

/** An enum field that is also allowed to be unanswered. */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.union([z.enum(values), z.literal('')]);

/**
 * The guided conversation's state. Sent with every request and returned on the
 * stream as a `data-brief` part, so the server stays authoritative about
 * which question comes next.
 */
export const tripBriefSchema = z.object({
  destination: z.string().trim().max(BriefLimits.DESTINATION).default(''),

  /**
   * Where they are flying from, in their own words — "New York", "SFO", "London".
   *
   * A city rather than an airport code, because that is what people say. Turning it
   * into a code is the model's job at the point of the tool call, which is the same
   * division used for the recommended hotel: the model supplies an identifier, the
   * provider supplies the money. Empty is a real state and a common one — someone
   * driving, or someone who would rather not say — and it costs only the fare, so
   * the cost card names flights among its exclusions and everything else still works.
   */
  origin: z.string().trim().max(BriefLimits.DESTINATION).default(''),

  /** The traveler's own words, e.g. "first week of October" or "5 nights". */
  dates: z.string().trim().max(BriefLimits.DATES).default(''),
  /** Resolved during extraction so hotel search has concrete check-in/out. */
  startDate: z.string().trim().max(BriefLimits.DATE_VALUE).default(''),
  endDate: z.string().trim().max(BriefLimits.DATE_VALUE).default(''),

  budgetLevel: optionalEnum(BUDGET_LEVELS).default(''),

  /**
   * A stated ceiling for the whole trip, in USD. Null when none was named.
   *
   * Separate from `budgetLevel` because they are different claims and only one of
   * them is checkable. A level is taste — what class of hotel to look at — while
   * "under $2000" is arithmetic the shortlist can actually do, and the ranker
   * already scores headroom against it and says what a stay leaves over. That
   * scoring had no way to be reached from the intake: "Find me a beach destination
   * under $2000" put the figure in `extras` as prose, and the number the traveller
   * cared most about was the one field nothing could read.
   */
  maxTotalUsd: z.coerce
    .number()
    .positive()
    .max(BriefLimits.MAX_BUDGET_USD)
    .nullable()
    .default(null),

  /**
   * The weather they asked for, when they asked for any.
   *
   * A field rather than a phrase, which it was until this replaced it. "Somewhere
   * warm in Europe" used to be stored whole in `destination`, and the planning turn
   * re-read the word "warm" out of that string every time it needed it — which
   * worked, and only worked when the preference happened to arrive alongside the
   * destination. Said one question later it had nowhere to go and survived only in
   * the transcript. It is not a question of its own: nobody should be asked their
   * preferred climate, but plenty of people mention it.
   */
  climate: optionalEnum(CLIMATE_PREFERENCES).default(''),
  interests: z
    .array(z.string().trim().max(BriefLimits.INTEREST))
    .max(BriefLimits.INTERESTS)
    .default([]),
  travelerType: optionalEnum(TRAVELER_TYPES).default(''),
  travelers: z.coerce
    .number()
    .int()
    .min(BriefLimits.MIN_TRAVELERS)
    .max(BriefLimits.MAX_TRAVELERS)
    .default(DEFAULT_TRAVELERS),
  extras: z.string().trim().max(BriefLimits.EXTRAS).default(''),
  pace: z.enum(TRIP_PACES).default(DEFAULT_PACE),

  /** Steps the server has accepted an answer for, in the order they completed. */
  answered: z.array(z.enum(STEP_IDS)).max(BriefLimits.ANSWERED).default([]),
  /** Re-asks spent on the current step. Bounded so the flow cannot stall. */
  retries: z.coerce.number().int().min(0).max(BriefLimits.MAX_RETRIES).default(0),

  /**
   * Replies to the current step that were handed straight back as unreadable.
   *
   * Counted separately from `retries` because they are a different event and get
   * a different answer. A retry is the flow deciding it misread a real reply and
   * quietly asking again; this is the flow telling the traveller their message
   * was not accepted, which is only defensible when the message genuinely was
   * not one. Sharing the counter would have let two vague answers spend the
   * budget that the one keyboard mash needs.
   */
  rejections: z.coerce.number().int().min(0).max(BriefLimits.MAX_REJECTIONS).default(0),
});

export type TripBrief = z.infer<typeof tripBriefSchema>;

export const emptyTripBrief: TripBrief = tripBriefSchema.parse({});

/**
 * Longer than this and it is a month someone named, not a trip they planned.
 *
 * "Next month" resolves honestly to the first and last of that month, which is a
 * perfectly good reading of the words and a useless basis for a quote: it prices a
 * 29-night stay for someone who meant to be away for five days.
 */
export const MAX_PLANNED_NIGHTS = 21;

/**
 * What the dates step still needs before anything can be priced, or null when it
 * has a window that looks like a trip.
 *
 * A rate only exists for specific nights, so "5 days" and "next month" are both
 * incomplete despite sounding decided — one is missing the when, the other the how
 * long. Left as answers, the first returns a shortlist with no costs at all and the
 * second returns costs for three weeks nobody asked for. Naming which half is
 * missing is what lets the next question ask for that half instead of repeating
 * itself.
 */
export function missingDateDetail(brief: TripBrief): 'window' | 'duration' | null {
  const nights = tripNights(brief);

  if (nights === null || nights <= 0) return 'window';
  if (nights > MAX_PLANNED_NIGHTS) return 'duration';
  return null;
}

/** Nights between resolved dates, or null when dates are still flexible. */
export function tripNights(brief: TripBrief): number | null {
  return nightsBetween(brief.startDate, brief.endDate);
}

/**
 * True when the traveler has been asked where they want to go and left it to us.
 *
 * Derived rather than stored, because the two pieces of state already say it: the
 * destination step is settled and the field is empty, which can only mean they
 * declined to name anywhere. Worth distinguishing from "not asked yet" — that is
 * the difference between a turn that owes them a shortlist and one that is simply
 * mid-interview, and both have an empty destination field.
 */
export function isDestinationOpen(brief: TripBrief): boolean {
  return brief.answered.includes('destination') && brief.destination.length === 0;
}

/**
 * True when the traveler has been asked where they fly from and there is no flight
 * to price — because they are driving, or because they would rather not say.
 *
 * Derived the same way as `isDestinationOpen`, and worth distinguishing for the same
 * reason: both states have an empty `origin`, and only one of them is a gap. Without
 * it the planning turn treats a deliberate skip as a missing fact and dutifully
 * announces it could not price the flights, which is a strange thing to tell someone
 * who has just said they are not taking one.
 */
export function isFlightlessTrip(brief: TripBrief): boolean {
  return brief.answered.includes('origin') && brief.origin.length === 0;
}

/** Prompt-ready lines for the fields the traveler has actually answered. */
export function describeTrip(brief: TripBrief): string {
  const lines: string[] = [];

  if (brief.destination) {
    lines.push(`Destination: ${brief.destination}`);
  } else if (isDestinationOpen(brief)) {
    lines.push('Destination: none chosen — they have asked you to suggest somewhere.');
  }

  if (brief.startDate && brief.endDate) {
    const nights = tripNights(brief);
    lines.push(
      `Dates: ${brief.startDate} to ${brief.endDate}${nights !== null ? ` (${nights} nights)` : ''}`,
    );
  } else if (brief.dates) {
    lines.push(`Dates: ${brief.dates} (not yet pinned to exact days)`);
  }

  if (brief.origin) {
    lines.push(`Flying from: ${brief.origin}`);
  } else if (isFlightlessTrip(brief)) {
    lines.push('Flights: not part of this trip — they are not flying, or would rather not say.');
  }
  if (brief.climate) lines.push(`Weather they asked for: ${brief.climate}`);
  if (brief.budgetLevel) lines.push(`Budget level: ${brief.budgetLevel}`);
  if (brief.maxTotalUsd !== null) {
    lines.push(`Total budget ceiling: ${formatPrice(brief.maxTotalUsd, BUDGET_CURRENCY)}`);
  }
  if (brief.interests.length > 0) lines.push(`Interests: ${brief.interests.join(', ')}`);
  if (brief.travelerType) lines.push(`Party: ${brief.travelerType}`);

  /*
   * The two fields that have a default, marked when that is all they are.
   *
   * Both used to be stated flatly, and a default stated flatly is indistinguishable
   * from an answer: the very first reply to "a week in Mexico City" came back as
   * "Got it, Mexico City for two" and called it "a balanced week", neither of which
   * the traveller had said. Told nothing, the model has no way to know — the brief
   * genuinely reads `travelers: 2, pace: balanced` from the moment it is created.
   *
   * Labelled rather than dropped, because the planning turn has to put a number in
   * a tool call and structure the days somehow. Saying which numbers are assumed
   * costs nothing there and stops them being repeated back as fact here.
   */
  const partyStated = brief.travelerType.length > 0 || brief.travelers !== DEFAULT_TRAVELERS;
  lines.push(
    partyStated
      ? `Travelers: ${brief.travelers}`
      : `Travelers: ${brief.travelers} (assumed — they have not said how many)`,
  );

  const paceStated = brief.pace !== DEFAULT_PACE;
  lines.push(
    paceStated
      ? `Preferred pace: ${brief.pace}`
      : `Preferred pace: ${brief.pace} (assumed — they have not said)`,
  );

  if (brief.extras) lines.push(`Must-sees and dealbreakers: ${brief.extras}`);

  return lines.join('\n');
}
