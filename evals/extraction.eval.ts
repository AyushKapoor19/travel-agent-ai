import { extractBrief } from '@/features/agent/extract';
import type { UnusableKind } from '@/features/agent/rejection';
import type { StepId, TripBrief } from '@/features/trip/brief';
import { emptyTripBrief } from '@/features/trip/brief';
import type { FlowStep } from '@/features/trip/flow';
import { FLOW_STEPS } from '@/features/trip/flow';

/**
 * Evals for the one part of this app a unit test cannot pin down.
 *
 * Everything downstream of the intake is deterministic and covered by `npm test`.
 * The extraction is not: it is a language model reading a sentence, and the only
 * honest way to check it is to run it on real sentences and assert on what comes
 * out. So this is a separate command from the test suite — it costs money, it needs
 * a key, and a red run here means the prompt regressed rather than the build broke.
 *
 * The assertions are deliberately about *downstream consequence* rather than exact
 * values. Whether the model writes "Europe" or "somewhere in Europe" changes nothing;
 * whether it puts 2000 in `maxTotalUsd` or leaves it in prose decides whether the
 * budget ever reaches the ranking. So each check is a predicate over the brief,
 * named by the behaviour it protects.
 *
 * The first three cases are the example sentences from the brief this app was built
 * against, quoted verbatim. They are the cases a reviewer will type in.
 */

type Check = {
  /** Reads as the behaviour being protected, and prints on failure. */
  what: string;
  ok: (brief: TripBrief, declined: boolean, unusable: UnusableKind | null) => boolean;
};

type EvalCase = {
  name: string;
  /** Which question the traveller is answering, since it steers the reading. */
  step: StepId;
  message: string;
  /** What was already known, for the cases about stating something late. */
  brief?: Partial<TripBrief>;
  checks: Check[];
};

const interestsInclude = (brief: TripBrief, needle: string): boolean =>
  brief.interests.some((interest) => interest.toLowerCase().includes(needle));

const CASES: readonly EvalCase[] = [
  /* ---------------------------------------------------------------------- */
  /* The three example sentences from the spec                              */
  /* ---------------------------------------------------------------------- */
  {
    name: 'spec 1: "I want to visit somewhere warm in Europe next month"',
    step: 'destination',
    message: 'I want to visit somewhere warm in Europe next month',
    checks: [
      {
        // The whole reason `climate` is a typed field: this used to live inside the
        // destination string, where the ranker could not reach it.
        what: 'the weather preference lands in `climate`, not only in prose',
        ok: (brief) => brief.climate === 'warm' || brief.climate === 'hot',
      },
      {
        what: 'the region is kept as a region rather than resolved to one city',
        ok: (brief) => /europe/i.test(brief.destination),
      },
      {
        what: 'a relative month is read as timing of some kind',
        ok: (brief) => brief.dates.length > 0 || brief.startDate.length > 0,
      },
      {
        what: 'stating a preference is not mistaken for declining to answer',
        ok: (_brief, declined) => declined === false,
      },
    ],
  },
  {
    name: 'spec 2: "Find me a beach destination under $2000 for 5 days"',
    step: 'destination',
    message: 'Find me a beach destination under $2000 for 5 days',
    checks: [
      {
        // The numeric ceiling. Without this the figure sat in `extras` as prose and
        // the budget scoring was unreachable from the intake.
        what: 'the ceiling is captured as the number 2000 in `maxTotalUsd`',
        ok: (brief) => brief.maxTotalUsd === 2000,
      },
      {
        what: 'the beach is read as an interest',
        ok: (brief) => interestsInclude(brief, 'beach'),
      },
      {
        what: 'the duration is recorded',
        ok: (brief) => /5|five/i.test(brief.dates),
      },
      {
        what: '"a beach destination" is not recorded as a place called that',
        ok: (brief) => !/beach destination/i.test(brief.destination),
      },
    ],
  },
  {
    name: 'spec 3: "I like adventure activities and good food, where should I go?"',
    step: 'destination',
    message: 'I like adventure activities and good food, where should I go?',
    checks: [
      {
        what: 'adventure is read as an interest',
        ok: (brief) => interestsInclude(brief, 'adventure'),
      },
      {
        what: 'food is read as an interest',
        ok: (brief) => interestsInclude(brief, 'food') || interestsInclude(brief, 'dining'),
      },
      {
        // Asking us to choose is the shortlist path. Recording the question as a
        // destination is how you end up planning a trip to a city called "where".
        what: 'asking where to go leaves the destination open rather than inventing one',
        ok: (brief, declined) => declined === true || brief.destination.length === 0,
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* The origin, which is what makes a fare checkable at all                 */
  /* ---------------------------------------------------------------------- */
  {
    name: 'origin: "flying out of Boston" alongside a destination',
    step: 'destination',
    message: "We'd be flying out of Boston to somewhere in Italy",
    checks: [
      {
        what: 'the origin is captured',
        ok: (brief) => /boston/i.test(brief.origin),
      },
      {
        // The two ends of a route are trivially confusable and the failure is silent:
        // a fare from Rome to Rome comes back empty and reads as an unpriceable route.
        what: 'the origin does not overwrite the destination',
        ok: (brief) => !/boston/i.test(brief.destination),
      },
    ],
  },
  {
    name: 'origin: "we\'re driving down, no flights" (the question is moot)',
    step: 'origin',
    brief: { destination: 'Mexico City', answered: ['destination'] },
    message: "we're driving down, no flights",
    checks: [
      {
        /*
         * The reading the generic decline description missed. "Surprise me" refuses a
         * question; this one answers it by saying it does not apply, and read as an
         * ordinary reply it is simply a sentence with no airport in it — so the flow
         * asked which airport they were flying from a second time.
         */
        what: 'a trip with no flight in it is read as a decline, not a missing answer',
        ok: (_brief, declined) => declined === true,
      },
      {
        what: 'the words are not recorded as a place to fly out of',
        ok: (brief) => brief.origin.length === 0,
      },
    ],
  },
  {
    name: 'origin: "rather keep that to myself" (a refusal, not a place)',
    step: 'origin',
    brief: { destination: 'Lisbon', answered: ['destination'] },
    message: 'rather keep that to myself',
    checks: [
      {
        what: 'a refusal settles the question',
        ok: (_brief, declined) => declined === true,
      },
      { what: 'nothing is recorded as an origin', ok: (brief) => brief.origin.length === 0 },
    ],
  },
  {
    name: 'origin: "out of SFO" is still an answer, not a decline',
    step: 'origin',
    brief: { destination: 'Tokyo', answered: ['destination'] },
    message: 'out of SFO',
    checks: [
      {
        // The negative that keeps the decline guidance from swallowing real answers.
        what: 'the airport is captured',
        ok: (brief) => /sfo|san francisco/i.test(brief.origin),
      },
      { what: 'answering is not mistaken for declining', ok: (_brief, declined) => !declined },
    ],
  },
  {
    name: 'origin: never inferred from a destination',
    step: 'destination',
    message: 'I want to go to Tokyo for a week',
    checks: [
      {
        /*
         * The tempting failure. An origin is the one field where a plausible guess is
         * worse than nothing: it silently produces a real fare for a flight nobody is
         * taking, and a wrong fare is the largest line in the trip total.
         */
        what: 'no origin is invented when none was stated',
        ok: (brief) => brief.origin.length === 0,
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* The budget ceiling, including the readings it must refuse               */
  /* ---------------------------------------------------------------------- */
  {
    name: 'budget: "$2k max, all in"',
    step: 'budget',
    message: '$2k max, all in',
    checks: [
      {
        what: 'shorthand for thousands is read as 2000',
        ok: (brief) => brief.maxTotalUsd === 2000,
      },
    ],
  },
  {
    name: 'budget: "around $150 a night" (a rate, not a trip ceiling)',
    step: 'budget',
    message: 'around $150 a night for the hotel',
    checks: [
      {
        /*
         * The important negative. A nightly rate recorded as a trip ceiling would
         * make every destination look catastrophically over budget, and the model
         * would then explain that in prose — confidently, and wrongly.
         */
        what: 'a nightly rate is not promoted to a whole-trip ceiling',
        ok: (brief) => brief.maxTotalUsd === null,
      },
      {
        what: 'the figure is still not lost — it lands somewhere on the brief',
        ok: (brief) => brief.budgetLevel.length > 0 || /150/.test(brief.extras),
      },
    ],
  },
  {
    name: 'budget: "no more than $3000 total for the two of us"',
    step: 'budget',
    message: 'no more than $3000 total for the two of us',
    checks: [
      { what: 'the total is captured', ok: (brief) => brief.maxTotalUsd === 3000 },
      {
        what: 'the head count in the same sentence is captured too',
        ok: (brief) => brief.travelers === 2,
      },
    ],
  },
  {
    name: 'budget: "mid-range, nothing fancy" (a level with no figure)',
    step: 'budget',
    message: 'mid-range, nothing fancy',
    checks: [
      { what: 'the level is read', ok: (brief) => brief.budgetLevel === 'mid-range' },
      {
        what: 'no figure is invented when none was given',
        ok: (brief) => brief.maxTotalUsd === null,
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Handing the choice back, and preferences stated out of order            */
  /* ---------------------------------------------------------------------- */
  {
    name: 'decline: "surprise me"',
    step: 'destination',
    message: 'surprise me',
    checks: [
      {
        // Without this the trip gets planned to a city called "Surprise me".
        what: 'recorded as a decline, with no destination invented',
        ok: (brief, declined) => declined === true && brief.destination.length === 0,
      },
    ],
  },
  {
    name: 'climate stated late, while answering about interests',
    step: 'interests',
    brief: { destination: '', answered: ['destination'] },
    message: 'food and history mainly, and somewhere hot please',
    checks: [
      {
        // The field is captured at whichever step it is mentioned, which is the point
        // of it being typed rather than parsed out of the destination answer.
        what: 'the climate is captured even though the question was about interests',
        ok: (brief) => brief.climate === 'hot' || brief.climate === 'warm',
      },
      {
        what: 'the interests asked about are captured as well',
        ok: (brief) => interestsInclude(brief, 'food') || interestsInclude(brief, 'dining'),
      },
    ],
  },
  {
    name: 'climate: "somewhere cool, I want to escape the heat"',
    step: 'destination',
    message: 'somewhere cool, I want to escape the heat',
    checks: [
      {
        what: 'escaping the heat maps to a cool band rather than a warm one',
        ok: (brief) => brief.climate === 'mild' || brief.climate === 'cold',
      },
    ],
  },
  {
    name: 'naming a cold city is not requesting cold weather',
    step: 'destination',
    message: 'Reykjavík',
    checks: [
      {
        /*
         * A place is not a preference. Inferring "cold" from Reykjavík would then
         * rank Reykjavík highly *for being cold*, which is circular — the app would
         * be citing the traveller's own choice back at them as evidence.
         */
        what: 'no climate preference is inferred from the choice of city',
        ok: (brief) => brief.climate === '',
      },
      {
        what: 'the city itself is recorded',
        ok: (brief) => /reykjav/i.test(brief.destination),
      },
    ],
  },
  {
    name: 'dates: "first week of October, about 6 nights"',
    step: 'dates',
    message: 'first week of October, about 6 nights',
    checks: [
      {
        what: 'a concrete window is resolved, so a stay can actually be priced',
        ok: (brief) => /^\d{4}-\d{2}-\d{2}$/.test(brief.startDate),
      },
      {
        what: 'the window lands in October',
        ok: (brief) => brief.startDate.slice(5, 7) === '10',
      },
      {
        what: 'the resolved window is in the future, not in a year already gone',
        ok: (brief) => brief.startDate >= new Date().toISOString().slice(0, 10),
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Replies that are not replies, and the many that only look like it       */
  /* ---------------------------------------------------------------------- */
  {
    name: 'unusable: a keyboard mash on the dates question',
    step: 'dates',
    brief: { destination: 'Lisbon', answered: ['destination', 'origin'] },
    message: 'asdkjhasd',
    checks: [
      {
        what: 'meaningless text is reported as gibberish rather than read',
        ok: (_brief, _declined, unusable) => unusable === 'gibberish',
      },
      {
        /*
         * The consequence, and the reason this is worth an eval rather than a note.
         * Dates has a raw-text fallback, so before the classifier existed the mash was
         * stored verbatim, the step was marked answered on the strength of it, and the
         * planning turn went looking for a stay for a trip taking place in "asdkjhasd".
         */
        what: 'nothing is stored, so the mash cannot become the travel dates',
        ok: (brief) => brief.dates.length === 0,
      },
    ],
  },
  {
    name: 'unusable: a coherent sentence about something else entirely',
    step: 'budget',
    brief: { destination: 'Lisbon', answered: ['destination', 'origin', 'dates'] },
    message: 'what do you think of the new season of that cooking show',
    checks: [
      {
        what: 'an answer to no question we asked is reported as off-topic',
        ok: (_brief, _declined, unusable) => unusable === 'off-topic',
      },
      { what: 'no budget is invented from it', ok: (brief) => brief.budgetLevel.length === 0 },
    ],
  },
  {
    name: 'unusable: a destination that is not a place',
    step: 'destination',
    message: 'I want to go to the centre of the sun for about nine hundred years',
    checks: [
      {
        what: 'an impossible trip is refused rather than planned',
        ok: (_brief, _declined, unusable) => unusable === 'off-topic',
      },
    ],
  },

  /*
   * "hey", at the three steps where letting it through did the most damage.
   *
   * The case this whole mechanism was rebuilt around. Typed at every question in turn
   * it answered all seven: the destination fell back to a shortlist, the origin and
   * the extras were marked answered empty, and the word itself was stored as the
   * travel dates and handed to the planning model, which duly wrote "Dates: hey (not
   * yet pinned to exact days)" into its brief and started recommending cities.
   *
   * Nothing about "hey" is weird, which is why asking a model whether it was weird
   * could never have caught it. What it is, is empty.
   */
  {
    name: 'empty: "hey" at the destination question',
    step: 'destination',
    message: 'hey',
    checks: [
      {
        what: 'a greeting is refused rather than treated as an answer',
        ok: (_brief, _declined, unusable) => unusable !== null,
      },
      {
        // The old outcome: destination settles empty, which is indistinguishable from
        // "surprise me" and quietly commits the trip to the shortlist path.
        what: 'it is not read as handing the choice of destination back',
        ok: (_brief, declined) => declined === false,
      },
    ],
  },
  {
    name: 'empty: "hey" at the dates question',
    step: 'dates',
    brief: { destination: 'Lisbon', answered: ['destination', 'origin'] },
    message: 'hey',
    checks: [
      {
        what: 'it is refused',
        ok: (_brief, _declined, unusable) => unusable !== null,
      },
      {
        // The exact corruption from the bug report. `dates` has a raw-text fallback,
        // and it used to run on any empty reading rather than only on an outage.
        what: 'the word is not stored as the travel dates',
        ok: (brief) => brief.dates.length === 0,
      },
    ],
  },
  {
    name: 'empty: "hey" at the anything-else question',
    step: 'extras',
    brief: {
      destination: 'Lisbon',
      answered: ['destination', 'origin', 'dates', 'budget', 'interests', 'travelers'],
    },
    message: 'hey',
    checks: [
      {
        // Optional, and optional never meant "accepts anything". The step is asked once
        // so that a real reply is not challenged; a blank one is not a real reply.
        what: 'an optional question refuses it too',
        ok: (_brief, _declined, unusable) => unusable !== null,
      },
      { what: 'the word is not stored as a must-see', ok: (brief) => brief.extras.length === 0 },
    ],
  },
  {
    name: 'empty: "ok" and "lol" carry no more than "hey" does',
    step: 'budget',
    brief: { destination: 'Lisbon', answered: ['destination', 'origin', 'dates'] },
    message: 'lol ok',
    checks: [
      {
        what: 'filler is refused whatever the filler happens to be',
        ok: (_brief, _declined, unusable) => unusable !== null,
      },
      { what: 'no budget is invented from it', ok: (brief) => brief.budgetLevel.length === 0 },
    ],
  },
  {
    name: 'empty: "idk" tells us nothing, and is refused gently',
    step: 'budget',
    brief: { destination: 'Lisbon', answered: ['destination', 'origin', 'dates'] },
    message: 'idk',
    checks: [
      {
        what: 'a reply with no detail in it does not settle the question',
        ok: (_brief, _declined, unusable) => unusable !== null,
      },
      {
        /*
         * The wording matters here more than the block does. "idk" is an honest answer
         * to a question about money and the traveller has done nothing wrong, so it
         * gets the line that blames our reading rather than the two that call their
         * message nonsense — and the suggestions are sitting underneath it.
         */
        what: 'they are not told their reply was gibberish or off-topic',
        ok: (_brief, _declined, unusable) => unusable === 'unanswered',
      },
    ],
  },

  /*
   * The negatives, and there are more of them than positives on purpose.
   *
   * Refusing an answer is the rudest thing this flow can do and the traveller cannot
   * argue with it, so being too eager is a far worse regression than being too lax —
   * a reply that slips through is asked about again, which is where it went before
   * any of this existed. These are the replies that sound careless and are not.
   *
   * All four turn on the same rule: one usable detail anywhere in the message is
   * enough, and it does not have to be a detail the current question asked for.
   */
  {
    name: 'usable: "not sure yet, somewhere cheap and sunny"',
    step: 'destination',
    message: 'not sure yet, somewhere cheap and sunny',
    checks: [
      {
        what: 'hesitation alongside real preferences is never unusable',
        ok: (_brief, _declined, unusable) => unusable === null,
      },
      {
        what: 'the preferences in it are still read',
        ok: (brief) => brief.climate.length > 0 || brief.budgetLevel.length > 0,
      },
    ],
  },
  {
    name: 'usable: an obscure but real place, spelt badly',
    step: 'destination',
    message: 'ljubjana',
    checks: [
      {
        // The false positive that would hurt most: a single unfamiliar word looks a lot
        // like a mash, and this one is a capital city with a letter missing.
        what: 'an unfamiliar single word is not mistaken for gibberish',
        ok: (_brief, _declined, unusable) => unusable === null,
      },
      { what: 'it is recorded as the destination', ok: (brief) => brief.destination.length > 0 },
    ],
  },
  {
    name: 'usable: answering a different trip question than the one asked',
    step: 'origin',
    brief: { destination: 'Lisbon', answered: ['destination'] },
    message: 'actually make it a family trip, four of us',
    checks: [
      {
        // Off-topic means "nothing to do with the trip", not "not the field I asked
        // for". Extraction is opportunistic by design and this is that design working.
        what: 'a reply about another part of the trip is not off-topic',
        ok: (_brief, _declined, unusable) => unusable === null,
      },
      { what: 'the party it describes is captured', ok: (brief) => brief.travelers === 4 },
    ],
  },
  {
    name: 'usable: "just the two of us", where the answer equals the default',
    step: 'travelers',
    brief: {
      destination: 'Lisbon',
      answered: ['destination', 'origin', 'dates', 'budget', 'interests'],
    },
    message: 'just the two of us',
    checks: [
      {
        /*
         * The trap in the obvious implementation of this feature. `travelers` is 2 from
         * the moment a brief exists, so a rule that refused any reply which failed to
         * change the brief would have told the commonest party size in travel that they
         * had not answered. What is tested is whether the reply was *read*, not whether
         * it moved anything.
         */
        what: 'an answer that matches the default is still an answer',
        ok: (_brief, _declined, unusable) => unusable === null,
      },
      { what: 'the party size survives', ok: (brief) => brief.travelers === 2 },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Running them                                                               */
/* -------------------------------------------------------------------------- */

const PASS = '\u001B[32mpass\u001B[0m';
const FAIL = '\u001B[31mFAIL\u001B[0m';

function stepFor(id: StepId): FlowStep {
  const step = FLOW_STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`No flow step called ${id}`);
  return step;
}

async function runCase(evalCase: EvalCase): Promise<{ passed: number; failed: string[] }> {
  const starting: TripBrief = { ...emptyTripBrief, ...evalCase.brief };
  const { brief, declined, unusable } = await extractBrief(
    starting,
    stepFor(evalCase.step),
    evalCase.message,
  );

  const failed: string[] = [];
  let passed = 0;

  for (const check of evalCase.checks) {
    if (check.ok(brief, declined, unusable)) passed += 1;
    else failed.push(check.what);
  }

  console.log(`\n${failed.length === 0 ? PASS : FAIL}  ${evalCase.name}`);
  for (const what of failed) console.log(`      missed: ${what}`);
  if (failed.length > 0) {
    // The whole brief, because a failure is nearly always a field landing somewhere
    // adjacent rather than nothing happening at all.
    console.log(
      `      got: ${JSON.stringify({
        destination: brief.destination,
        dates: brief.dates,
        startDate: brief.startDate,
        climate: brief.climate,
        budgetLevel: brief.budgetLevel,
        maxTotalUsd: brief.maxTotalUsd,
        interests: brief.interests,
        travelers: brief.travelers,
        extras: brief.extras,
        declined,
        unusable,
      })}`,
    );
  }

  return { passed, failed };
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error('GOOGLE_GENERATIVE_AI_API_KEY is required. These evals call a live model.');
    process.exit(1);
  }

  console.log(`Running ${CASES.length} extraction evals against a live model.`);

  let checksRun = 0;
  let checksPassed = 0;
  const failedCases: string[] = [];

  // Sequential on purpose: the free tier rate-limits, and a batch that trips the
  // limit reports a prompt regression that never happened.
  for (const evalCase of CASES) {
    const { passed, failed } = await runCase(evalCase);
    checksRun += evalCase.checks.length;
    checksPassed += passed;
    if (failed.length > 0) failedCases.push(evalCase.name);
  }

  console.log(
    `\n${checksPassed}/${checksRun} checks passed across ${CASES.length} cases, ${failedCases.length} case(s) with a miss.`,
  );

  if (failedCases.length > 0) process.exit(1);
}

void main();
