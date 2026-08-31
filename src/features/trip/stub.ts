import type { RailField, RailTone } from '@/components/ui/field-rail';
import { formatDateRange, formatPrice } from '@/lib/format';

import type { StepId, TripBrief } from './brief';
import { BUDGET_CURRENCY, DEFAULT_TRAVELERS, STEP_IDS } from './brief';

/** What a field with nothing in it prints. */
const BLANK = '—';

/**
 * The brief as the fields of a travel document, which is the one shape both
 * surfaces that draw it actually want.
 *
 * It replaced a function that returned a list of sentences for the itinerary
 * header. Sentences were enough while the brief was only ever summarised at the
 * end, and stopped being enough the moment the intake began showing the same
 * information as it was filled in: a rail of labelled cells has to know which
 * cells are still blank, and "which of these six strings is missing" is not a
 * question a list of strings can answer.
 *
 * So a field is emitted for every question in the flow whether or not it has been
 * asked, and the tone says which. The intake draws all seven and the finished plan
 * draws the ones that came back, from the same array.
 *
 * Returns the rail's own field type rather than a shape of its own. There was a
 * version with both and a function between them, and the function was thirty lines
 * of mapping three states onto three states — the model and the drawing genuinely
 * agree about what a field is, and pretending otherwise only bought a place for
 * them to disagree.
 */
export type StubField = RailField & { id: StepId };

/**
 * Field names, which are deliberately not the question labels from `flow.ts`.
 *
 * A question label reads inside a sentence about what is being asked — "Flying
 * from", "Anything else". A field name is stamped on a document in ten characters
 * and read as a column heading. Written out per step rather than derived, and keyed
 * by `StepId` so a question added to the flow is a compile error here rather than a
 * blank cell nobody notices.
 */
const FIELD_LABELS: Record<StepId, string> = {
  destination: 'Destination',
  origin: 'From',
  dates: 'When',
  budget: 'Budget',
  interests: 'Style',
  travelers: 'Party',
  extras: 'Notes',
};

/**
 * What a settled question with no answer in it says.
 *
 * Three of the seven can be declined and mean something specific by it, and an open
 * destination is the clearest case: it is not a missing field, it is a ticket
 * written before anyone chose where to go, which is what the word means on a real
 * one. The rest can only reach this state by exhausting the flow's retries — nobody
 * declined, we simply never got a readable answer — and the only honest thing to
 * print for that is the same dash as a blank.
 */
const SETTLED: Record<StepId, string> = {
  destination: 'Open',
  origin: 'No flight',
  dates: BLANK,
  budget: BLANK,
  interests: BLANK,
  travelers: BLANK,
  extras: 'None',
};

/**
 * What the traveller told us about the party, and nothing it was defaulted to.
 *
 * The head count is only printed when it is not the default two, because that is
 * the only case in which it is known to have been said — the brief reads
 * `travelers: 2` from the moment it is created, and a cell announcing "solo · 2" is
 * the document contradicting itself.
 */
function partyValue(brief: TripBrief): string {
  if (!brief.travelerType) return '';
  if (brief.travelers === DEFAULT_TRAVELERS) return brief.travelerType;
  return `${brief.travelerType} · ${brief.travelers}`;
}

/**
 * Both halves of what was said about money, because they are different claims and a
 * traveller who gave both gave them for different reasons: the level says what class
 * of room to look at, the ceiling is arithmetic the plan gets checked against.
 */
function budgetValue(brief: TripBrief): string {
  const ceiling = formatPrice(brief.maxTotalUsd, BUDGET_CURRENCY);
  return [brief.budgetLevel, ceiling && `under ${ceiling}`].filter(Boolean).join(' · ');
}

function datesValue(brief: TripBrief): string {
  // Their own words are the fallback rather than the preference: "the first week of
  // October" is what they said, and "Oct 1–7" is what it resolved to and what
  // everything downstream was priced against.
  return formatDateRange(brief.startDate, brief.endDate) ?? brief.dates;
}

/** What the brief holds for one field, empty when it holds nothing. */
function answerValue(id: StepId, brief: TripBrief): string {
  switch (id) {
    case 'destination':
      return brief.destination;
    case 'origin':
      return brief.origin;
    case 'dates':
      return datesValue(brief);
    case 'budget':
      return budgetValue(brief);
    case 'interests':
      return brief.interests.join(', ');
    case 'travelers':
      return partyValue(brief);
    case 'extras':
      return brief.extras;
  }
}

function field(id: StepId, value: string, tone: RailTone): StubField {
  return { id, label: FIELD_LABELS[id], value, tone };
}

/**
 * The brief as a document, one field per question, in the order they are asked.
 *
 * Pure and exhaustive over `StepId`, so the rail cannot silently disagree with the
 * flow about how many questions there are.
 */
export function tripStub(brief: TripBrief): StubField[] {
  return STEP_IDS.map((id) => {
    const answer = answerValue(id, brief);
    if (answer) return field(id, answer, 'stated');

    // Asked and settled without a value: driving rather than flying, no destination
    // in mind, nothing to add. Worth telling apart from a question nobody has
    // reached, because to a reader looking for what is left the two mean opposite
    // things — one is a decision and the other is a gap.
    if (brief.answered.includes(id)) return field(id, SETTLED[id], 'settled');

    return field(id, BLANK, 'blank');
  });
}
