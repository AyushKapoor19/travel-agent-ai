import 'server-only';

import type { UIMessage, UIMessageStreamWriter } from 'ai';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';

import { buildPlanningPrompt, buildQuestionPrompt } from '@/features/agent/prompt';
import type { TripBrief } from '@/features/trip/brief';
import type { FlowStep } from '@/features/trip/flow';
import { advanceFlow, canReject, nextStep, recordRejection } from '@/features/trip/flow';

import { extractBrief } from './extract';
import { lastUserText } from './message-text';
import type { WayfareUIMessage } from './messages';
import { TurnKind } from './messages';
import {
  CONVERSATION_TEMPERATURE,
  conversationModel,
  MAX_PLANNING_STEPS,
  PLANNING_TEMPERATURE,
  planningModel,
} from './provider';
import { describeRejection } from './rejection';
import { travelTools } from './tools';

/**
 * One turn of the conversation.
 *
 * The order is the whole design, and it is deliberately not the model's to
 * decide: read what the reply revealed, let the state machine judge whether that
 * answered the question, and only then ask the model to do one of exactly two
 * things. A model that chose its own next step would re-ask answered questions
 * and start planning on a half-filled brief.
 */

export type RunTurnOptions = {
  writer: UIMessageStreamWriter<WayfareUIMessage>;
  messages: UIMessage[];
  brief: TripBrief;
};

/**
 * Merged without start/finish frames: the writer owns the message envelope.
 *
 * Reasoning is withheld as well. The planning model thinks before it answers and
 * none of that is written for a traveller — it is the brief read back, the searches
 * rehearsed, the turn classified — so sending it costs bandwidth to ship prose the
 * client is only going to filter out.
 */
const MERGE_OPTIONS = { sendStart: false, sendFinish: false, sendReasoning: false } as const;

export async function runTurn({
  writer,
  messages,
  brief: incoming,
}: RunTurnOptions): Promise<void> {
  const askedStep = nextStep(incoming);
  const userText = lastUserText(messages);
  const modelMessages = await convertToModelMessages(messages);

  // 1. Read whatever the reply revealed, then let the state machine decide
  //    whether that satisfies the question we asked.
  let brief = incoming;
  // Carried into the question prompt, because a decline is the one reply the model
  // cannot read for itself: the transcript shows "Not flying" and nothing about
  // whether the server accepted it as an answer or is about to ask again.
  let declinedStep: FlowStep | null = null;
  if (askedStep && userText) {
    const { brief: extracted, declined, unusable } = await extractBrief(brief, askedStep, userText);

    /*
     * The one turn that ends without the agent saying anything.
     *
     * Everything below this point moves the conversation on — it marks the step
     * answered, or asks it again in different words, or starts the plan — and all
     * three are the wrong response to a message that was not an answer. Asking
     * again in different words is the subtlest of the three and still wrong: it
     * reads as the agent having a second try at phrasing, when what actually
     * happened is that nothing was understood, and it spends the re-ask that a
     * genuinely misread reply is owed.
     *
     * So the step stands, the brief is unchanged but for the refusal we just
     * spent, and the traveller gets the question back with a plain sentence
     * saying why. Returning here also means no model is asked to write anything,
     * which is what makes the correction instant instead of streamed.
     */
    if (unusable && canReject(brief)) {
      const rejected = recordRejection(brief);

      writer.write({ type: 'data-brief', data: rejected, transient: true });
      writer.write({
        type: 'data-rejection',
        data: {
          stepId: askedStep.id,
          message: describeRejection(askedStep, unusable, brief.rejections),
        },
        transient: true,
      });
      return;
    }

    if (declined) declinedStep = askedStep;
    brief = advanceFlow(extracted, askedStep, declined);
  }

  writer.write({ type: 'data-brief', data: brief, transient: true });

  // 2. The server, not the model, decides what happens this turn.
  const upcoming = nextStep(brief);

  writer.write({
    type: 'data-phase',
    data: {
      kind: upcoming ? TurnKind.QUESTION : TurnKind.PLANNING,
      stepId: upcoming?.id ?? null,
      destination: brief.destination,
    },
    transient: true,
  });

  if (upcoming) {
    const question = streamText({
      model: conversationModel(),
      system: buildQuestionPrompt(brief, upcoming, declinedStep),
      messages: modelMessages,
      temperature: CONVERSATION_TEMPERATURE,
    });

    writer.merge(question.toUIMessageStream(MERGE_OPTIONS));
    return;
  }

  // 3. Brief complete: search for real options, then write the itinerary.
  const plan = streamText({
    model: planningModel(),
    system: buildPlanningPrompt(brief),
    messages: modelMessages,
    tools: travelTools,
    stopWhen: stepCountIs(MAX_PLANNING_STEPS),
    temperature: PLANNING_TEMPERATURE,
  });

  writer.merge(plan.toUIMessageStream(MERGE_OPTIONS));
}
