import type { FlowStep } from '@/features/trip/flow';

/**
 * Why a reply was handed back, which is only ever one of three things.
 *
 * The last of them is the load-bearing one and the other two are a courtesy. A
 * reply is refused because the extractor read nothing out of it — that is a fact
 * about the brief, decided in TypeScript, and it does not depend on a model
 * agreeing that the message was odd. `gibberish` and `off-topic` exist so that
 * when the model *can* say what was wrong with it, the traveller gets told
 * something better than the generic line.
 *
 * Built the other way round first, and the failure was instructive: the model was
 * asked to judge whether a reply was weird, and "hey" is not weird. It sailed
 * through every one of the seven questions, and the word was filed as the travel
 * dates. Weirdness was never the property that mattered. Emptiness was.
 */
export const UNUSABLE_KINDS = ['gibberish', 'off-topic', 'unanswered'] as const;

export type UnusableKind = (typeof UNUSABLE_KINDS)[number];

/** The two the model is allowed to volunteer. `unanswered` is derived, never asked for. */
export const MODEL_UNUSABLE_KINDS = ['gibberish', 'off-topic'] as const;

/**
 * What the model is told about the two kinds it can name.
 *
 * Shorter than it was, because most of the work moved out of the prompt. It no
 * longer has to catch every kind of non-answer — an empty extraction catches
 * those on its own — so all this asks for is a name for the two cases where the
 * traveller deserves a more specific sentence than "that didn't answer it".
 *
 * The last rule is the one that keeps this from costing real answers. Flagging
 * and extracting are made mutually exclusive, so a message that is half an answer
 * and half nonsense — "Paris, and what's your favourite colour?" — is an answer,
 * and Paris survives.
 */
export const UNUSABLE_GUIDANCE = `If the reply is not an attempt at the question at all, name it with \`unusable\`:
- "gibberish" when the text carries no meaning: keyboard mash such as "asdkjhasd", random characters, repeated letters, a fragment that is not a word in any language.
- "off-topic" when the text is coherent but has nothing to do with travel, or is impossible as a trip detail — a destination that is not a place, a party of ten thousand, travelling for forty years.
- null for everything else, including greetings and filler such as "hey" or "ok". Those are handled elsewhere and do not need naming.
- Never set \`unusable\` on a reply you extracted a field from. If you filled anything in from it, it was an answer, whatever else it also contained.`;

/**
 * The opening line, chosen by what we can actually say about the reply.
 *
 * `unanswered` is the honest default and deliberately describes our own failure
 * rather than their message: we did not get an answer out of it. The traveller
 * may well have written something perfectly sensible that the extractor could not
 * read, and telling them their reply was nonsense when it was not is the one
 * outcome here worse than having let it through.
 */
const OPENING: Record<UnusableKind, string> = {
  gibberish: "I couldn't make sense of that.",
  'off-topic': "That doesn't answer what I asked.",
  unanswered: "I didn't get an answer out of that.",
};

/**
 * The sentence shown under the answer line, phrased here rather than by the model.
 *
 * Written on the server for the same reason `describeModelError` is: this is the
 * one moment in the conversation where the traveller needs a straight answer
 * immediately, and a streamed apology would arrive a word at a time and be a
 * different apology every time. It also cannot be got wrong — a model asked to
 * say "I could not read that" has, on occasion, tried to be charming about it.
 *
 * The question is repeated because the error takes the place of the turn that
 * would have re-asked it, and the wording up the screen is the agent's own.
 *
 * The second refusal onward points at the quick replies, which is the part that
 * stops this being a wall. Someone whose answer keeps coming back is either
 * writing something we genuinely cannot parse or testing what happens, and both
 * are better served by a button than by being told to rephrase a third time.
 */
export function describeRejection(step: FlowStep, kind: UnusableKind, priorRejections = 0): string {
  const way =
    priorRejections > 0
      ? 'Put it another way below, or pick one of the suggestions.'
      : 'Edit your answer above and send it again.';

  return `${OPENING[kind]} ${step.question} ${way}`;
}
