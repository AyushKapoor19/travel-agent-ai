import type { StepId, TripBrief } from './brief';
import {
  BUDGET_LEVELS,
  INTEREST_OPTIONS,
  missingDateDetail,
  STEP_IDS,
  TRAVELER_TYPES,
} from './brief';

/**
 * What "no" means for a question where "no" is an answer rather than a reply that
 * failed to parse.
 *
 * It used to be a bare `declinable: true`, and the flag was not enough. Declining
 * means something different at every step — "you choose" on `destination`, "nothing
 * to add" on `extras`, "we are not taking a flight" on `origin` — and the extractor
 * was only ever told the first of those. So "Not flying" came back as a reply that
 * had simply failed to answer the question, and the traveller was asked which
 * airport they were flying from a second time, one line after being told the
 * flights would be skipped.
 */
type DeclineRule = {
  /** Given to the extractor, so it knows what a "no" sounds like on this question. */
  means: string;
  /**
   * The chips that are themselves a decline, matched exactly and before any model
   * runs. These are strings this app wrote coming back unchanged, so pressing one
   * is a fact rather than a reading, and it must not depend on an inference call.
   */
  chips: readonly string[];
  /**
   * Whether a reply that neither answered nor clearly declined is worth one more ask.
   *
   * False for the questions whose whole framing was "this is optional". Asking those
   * twice is the rudest thing this flow can do — it tells the traveller their answer
   * was not accepted after telling them they did not have to give one — and the cost
   * of letting it go is small, because extraction is opportunistic: an origin
   * mentioned two questions later still lands on the brief.
   */
  reask: boolean;
};

export type FlowStep = {
  id: StepId;
  /** Shown beside the progress dots. */
  label: string;
  /** Used verbatim if the model is unavailable, and as the intent for phrasing. */
  question: string;
  /** What the model should ask for on this turn. */
  directive: string;
  chips: readonly string[];
  /** Chips accumulate instead of submitting immediately. */
  multiSelect?: boolean;
  /** Present when declining settles this step instead of failing it. */
  decline?: DeclineRule;
};

/** Max re-asks before the flow advances anyway, so a demo can never deadlock. */
export const MAX_RETRIES = 1;

/**
 * Times one step may hand a reply straight back before it stops refusing them.
 *
 * Higher than `MAX_RETRIES` because the two caps protect against opposite things.
 * The retry cap protects the traveller from a flow that will not move on; this one
 * protects them from a flow that will not let them past — and the way out is
 * entirely in their hands, since any reply carrying one usable detail clears it.
 *
 * Four rather than the one a retry gets, because the escape hatch here is real and
 * signposted: every step shows its suggestions, and from the second refusal the
 * message points at them. Someone still stuck on the fourth attempt is not going to
 * be helped by a fifth.
 *
 * What survives the cap matters more than the number. Past it the reply takes the
 * ordinary path — read for whatever it holds, retried once, then allowed through —
 * and since the raw-text fallback no longer runs on a reply that was read and found
 * empty, giving up means the question goes unanswered rather than answered wrongly.
 */
export const MAX_REJECTIONS = 4;

export const FLOW_STEPS: readonly FlowStep[] = [
  {
    id: 'destination',
    label: 'Destination',
    question: 'Where do you want to go?',
    directive:
      'Ask where they want to go, and make clear that not knowing is fine — you can suggest somewhere once you know what they are after. A region or "somewhere warm" is a useful answer too.',
    chips: ['Surprise me'],
    // Declining is the whole "where should I go" case the app exists to answer, so
    // it settles the step rather than failing it. Left empty, the destination stays
    // open through the rest of the intake and the planning turn offers a shortlist.
    decline: {
      /*
       * Handing the choice over, and nothing weaker than that.
       *
       * "Not sure yet" is hesitation rather than a decision, and reading it as one
       * costs more than a re-ask: the step closes, the next question asked is where
       * they are flying *from*, and "somewhere in Portugal" — said to answer the
       * question they thought was still open — gets filed as the departure city of a
       * trip with no destination at all.
       */
      means:
        'handing the choice of destination back to you — "surprise me", "you pick", "anywhere nice". Hesitation such as "not sure yet" is not a decline. Neither is a region such as "Europe" or a preference such as "somewhere warm": record what they said.',
      chips: ['Surprise me'],
      // The one optional question worth asking twice: everything downstream is built
      // on it, and a shortlist is a much bigger thing to fall back on by accident.
      reask: true,
    },
  },
  {
    id: 'origin',
    label: 'Flying from',
    question: 'And where would you be flying from?',
    directive:
      'Ask which city or airport they would be flying from, and make clear they can skip it — it only decides whether you can price the flights.',
    chips: ['Not flying', "I'd rather not say"],
    /*
     * Declinable, because the honest answer is sometimes "none of your business" and
     * sometimes "we are driving". Declining costs exactly one line of the trip: the
     * cost card names flights among its exclusions and everything else is unaffected,
     * which is a far better outcome than a required question people abandon on.
     */
    decline: {
      means:
        'saying no flight is involved — "not flying", "we are driving", "taking the train", "already there" — or not wanting to give a departure city. Both settle the question; neither is a place, so never record the words as an origin.',
      chips: ['Not flying', "I'd rather not say"],
      reask: false,
    },
  },
  {
    id: 'dates',
    label: 'Dates',
    question: 'When are you thinking of travelling, and for how long?',
    directive:
      'Ask when they want to travel and for how long. Exact dates or a rough window are both fine, but you need both halves: a length with no timing cannot be priced.',
    // Each chip answers both halves, because every one of these used to be a length
    // alone — so the quickest path through the question produced the one answer that
    // could not be priced, and earned itself a follow-up.
    chips: ['A week next month', 'A long weekend soon', 'Two weeks in the summer', "I'm flexible"],
  },
  {
    id: 'budget',
    label: 'Budget',
    question: 'What kind of budget are we working with?',
    directive: 'Ask what budget level suits them. Keep it light, not intrusive.',
    chips: BUDGET_LEVELS,
  },
  {
    id: 'interests',
    label: 'Style',
    question: 'What do you most want out of this trip?',
    directive:
      'Ask what they want out of the trip, so you know what to prioritise. Mention they can pick a few.',
    chips: INTEREST_OPTIONS,
    multiSelect: true,
  },
  {
    id: 'travelers',
    label: 'Travelers',
    question: 'Who is travelling?',
    directive: 'Ask who is coming along, and how many people in total.',
    chips: TRAVELER_TYPES,
  },
  {
    id: 'extras',
    label: 'Anything else',
    question: 'Anything else I should know — must-sees, dealbreakers, pace?',
    directive:
      'Ask if there is anything else you should know: must-sees, dealbreakers, or pace preferences. Make clear it is optional.',
    chips: ['Nothing else', 'Keep it relaxed', 'Pack it in'],
    decline: {
      means:
        'saying there is nothing to add — "nothing else", "that\'s everything", "no". A pace preference such as "keep it relaxed" is an answer, not a decline.',
      chips: ['Nothing else'],
      reask: false,
    },
  },
];

/** Just enough of a step for the progress indicator, which needs no prompt text. */
export type FlowStepMeta = { id: StepId; label: string };

export const FLOW_STEP_META: readonly FlowStepMeta[] = FLOW_STEPS.map(({ id, label }) => ({
  id,
  label,
}));

function stepById(id: StepId): FlowStep {
  const step = FLOW_STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Unknown flow step: ${id}`);
  return step;
}

/**
 * True once the brief holds a usable value for that step.
 *
 * Exhaustive over `StepId` with no default, so adding a question to the flow is
 * a compile error here rather than a step that is silently never satisfied.
 */
function hasAnswerFor(step: StepId, brief: TripBrief): boolean {
  switch (step) {
    case 'destination':
      return brief.destination.length > 0;
    case 'origin':
      return brief.origin.length > 0;
    case 'dates':
      // Prose alone used to satisfy this, which let "5 days" through as a settled
      // answer that nothing could be priced against. The retry cap means asking for
      // the missing half costs at most one extra question and cannot deadlock.
      return missingDateDetail(brief) === null;
    case 'budget':
      // Either answers it. Someone who opened with "under $2000" has told us more
      // about their budget than the three levels can express, and asking them to
      // pick one afterwards reads as not having listened.
      return brief.budgetLevel.length > 0 || brief.maxTotalUsd !== null;
    case 'interests':
      return brief.interests.length > 0;
    case 'travelers':
      return brief.travelerType.length > 0;
    case 'extras':
      return brief.extras.length > 0;
  }
}

/** The step still to be asked, or null when the brief is complete. */
export function nextStep(brief: TripBrief): FlowStep | null {
  const remaining = STEP_IDS.find((id) => !brief.answered.includes(id));
  return remaining ? stepById(remaining) : null;
}

/** Index for the progress indicator; equals FLOW_STEPS.length when complete. */
export function stepIndex(brief: TripBrief): number {
  const step = nextStep(brief);
  if (!step) return FLOW_STEPS.length;
  return FLOW_STEPS.findIndex((candidate) => candidate.id === step.id);
}

export function isBriefComplete(brief: TripBrief): boolean {
  return nextStep(brief) === null;
}

/**
 * Punctuation, case and the apostrophe the chip is written with all removed.
 *
 * The chips are rendered with a typographic apostrophe and a traveller typing the
 * same words uses the ASCII one, so a comparison that did not fold them would
 * recognise "I'd rather not say" pressed and not "I'd rather not say" typed.
 */
function normalizeReply(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/['‘’]/gu, '')
    .replaceAll(/[^a-z0-9]+/gu, ' ')
    .trim();
}

/**
 * True when the reply is exactly one of this step's decline chips.
 *
 * Deliberately exact rather than fuzzy. A chip press is this app's own string coming
 * back unchanged, which makes declining a fact we can settle without a model — and
 * that matters twice over: it is the answer the traveller gave with one tap and
 * expects to be honoured, and it is the one that still has to work when extraction
 * times out. Anything the traveller phrased themselves is left to the extractor,
 * which is told what declining means for this step.
 */
export function isDeclineReply(step: FlowStep, message: string): boolean {
  if (!step.decline) return false;
  const reply = normalizeReply(message);
  return reply.length > 0 && step.decline.chips.some((chip) => normalizeReply(chip) === reply);
}

/**
 * Whether an unreadable reply should be handed back rather than absorbed.
 *
 * The cap is the whole of the judgement here: refusing an answer is the right
 * thing to do to a keyboard mash and the wrong thing to do three times running to
 * someone who is telling the truth in a way we cannot parse. Past it the reply
 * takes the ordinary path — read for whatever it holds, retried once, then
 * allowed through — which is where every reply went before any of this existed.
 */
export function canReject(brief: TripBrief): boolean {
  return brief.rejections < MAX_REJECTIONS;
}

/**
 * The brief after a reply was refused: one more refusal spent and nothing else.
 *
 * Deliberately not a retry. The traveller is being shown the same question with an
 * explanation attached rather than a reworded one, so nothing about the step has
 * been used up — and spending a retry here would mean two bad replies could push a
 * question past the one re-ask it is owed for a reply we actually misread.
 */
export function recordRejection(brief: TripBrief): TripBrief {
  return { ...brief, rejections: brief.rejections + 1 };
}

/**
 * Whether the question just asked is settled, however the traveler answered it.
 *
 * Exhausting the retries is the last resort rather than the only backstop, because
 * as the only backstop it produced the worst turn this app has: the traveler pressed
 * "Not flying", the extractor read that as a reply that had failed to name an
 * airport, and the flow asked for the airport again — one sentence after the model
 * had acknowledged, from the transcript, that the flights were being skipped.
 */
function isSettled(brief: TripBrief, step: FlowStep, declined: boolean): boolean {
  if (hasAnswerFor(step.id, brief)) return true;

  if (step.decline) {
    // "No" is an answer to this one, so it settles the step rather than failing it.
    if (declined) return true;
    // And a question framed as optional gets asked once. Whatever they replied, they
    // have now had their turn at it, and pressing them is worse than doing without.
    if (!step.decline.reask) return true;
  }

  return brief.retries >= MAX_RETRIES;
}

/**
 * Decides whether the just-asked step is satisfied and returns the brief to
 * use for the rest of this turn.
 *
 * Every *other* step the brief can now answer is marked too. Someone who says
 * "two of us in Tokyo for a week, mid-range, we love food" has answered five
 * questions in one sentence, and asking them again would be insulting.
 */
export function advanceFlow(brief: TripBrief, current: FlowStep, declined: boolean): TripBrief {
  const currentDone = isSettled(brief, current, declined);

  const answered = [...brief.answered];
  for (const id of STEP_IDS) {
    if (answered.includes(id)) continue;
    const done = id === current.id ? currentDone : hasAnswerFor(id, brief);
    if (done) answered.push(id);
  }

  return {
    ...brief,
    answered,
    retries: currentDone ? 0 : brief.retries + 1,
    // Cleared on every accepted reply rather than only on a settled one, because the
    // budget is per question and this is the traveller demonstrating they can answer
    // it. Carried across steps, three unreadable replies spread over an entire intake
    // would leave the last question unable to refuse anything.
    rejections: 0,
  };
}
