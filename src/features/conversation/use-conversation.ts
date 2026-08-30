'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useChat } from '@ai-sdk/react';

import { partsText } from '@/features/agent/message-text';
import type { TurnPhase, TurnRejection, WayfareUIMessage } from '@/features/agent/messages';
import { TurnKind } from '@/features/agent/messages';
import type { TripBrief } from '@/features/trip/brief';
import { emptyTripBrief } from '@/features/trip/brief';
import type { FlowStep } from '@/features/trip/flow';
import { isBriefComplete, nextStep, stepIndex } from '@/features/trip/flow';
import { hasPendingMessage, takePendingMessage } from '@/features/trip/handoff';

/**
 * Everything the chat screen knows, and nothing about how it looks.
 *
 * Pulled out of the view because the two are on different clocks: the brief
 * arrives out of band on the stream, the composer is local state, and the
 * multi-select chips accumulate between turns. Tangled into the JSX, the rule
 * that the *server* owns the brief — and that `sendMessage` must be handed the
 * newest one synchronously — was a ref buried three hundred lines from the
 * effect that set it.
 */

/**
 * Undoes the turn a refused reply started, so the screen is exactly where it was
 * before they pressed send.
 *
 * Both messages have to go, and the assistant one is the one that matters. A
 * refused turn writes no text, so it leaves an assistant message with nothing in
 * it — and the intake reads the newest assistant message as the question on
 * screen. Left in place, an empty one blanks the question, which falls back to the
 * canned opening line: mash the keyboard on the fifth question and the screen
 * appears to throw the whole intake away and ask where you want to go.
 *
 * The traveller's own message goes with it because it is about to reappear in the
 * answer field for them to fix. Keeping both would send the rejected text a second
 * time as history, and the model would be reading it while they were still editing.
 */
function withoutRefusedTurn(messages: WayfareUIMessage[]): WayfareUIMessage[] {
  const kept = [...messages];

  const reply = kept[kept.length - 1];
  if (reply?.role !== 'assistant' || partsText(reply.parts).length > 0) return messages;
  kept.pop();

  if (kept[kept.length - 1]?.role === 'user') kept.pop();
  return kept;
}

export type Conversation = {
  messages: WayfareUIMessage[];
  /** The brief as the server last reported it. Never edited on the client. */
  brief: TripBrief;
  /** The step being asked now, or null once the brief is complete. */
  currentStep: FlowStep | null;
  /** Position for the progress indicator; equals the step count when complete. */
  stepIndex: number;
  /** A request is in flight, so input is refused and the orb is lit. */
  busy: boolean;
  /** The first token has not landed yet. */
  awaitingReply: boolean;
  /** The server has stopped asking questions and is building the plan. */
  planning: boolean;
  error: Error | undefined;
  /**
   * The last answer the server would not accept, or null.
   *
   * Cleared the moment anything is sent, so it describes the answer currently in
   * the field rather than a complaint left over from two turns ago.
   */
  rejection: TurnRejection | null;

  input: string;
  setInput: (value: string) => void;

  /** Chips picked so far on a multi-select step, in the order they were pressed. */
  picked: string[];
  toggle: (chip: string) => void;

  send: (text: string) => void;
  submitPicked: () => void;
  retry: () => void;
  stop: () => void;
  reset: () => void;

  /** Whether the last assistant message is the one this turn is producing. */
  isCurrentReply: (messageId: string) => boolean;
};

export function useConversation(): Conversation {
  const [brief, setBrief] = useState<TripBrief>(emptyTripBrief);
  const [phase, setPhase] = useState<TurnPhase | null>(null);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [rejection, setRejection] = useState<TurnRejection | null>(null);

  /*
   * Held aside while the turn finishes rather than applied when it arrives.
   *
   * The signal lands mid-stream, and what it asks for is the removal of the very
   * message that stream is still writing into. Applied there, `useChat` re-adds the
   * message it is holding a reference to and the refused turn comes back — so this
   * waits for the transport to be done with it, which is the render `status` turns
   * back to 'ready'.
   */
  const refusedRef = useRef<TurnRejection | null>(null);
  /** The text of the answer being sent, so a refused one can go back in the field. */
  const sentRef = useRef('');

  // The server is authoritative about the brief, but sendMessage needs the
  // latest copy synchronously, so keep a ref alongside the render state.
  const briefRef = useRef<TripBrief>(emptyTripBrief);
  const startedRef = useRef(false);

  /**
   * Arrived from the landing page with something already said.
   *
   * Read on the first render rather than in the effect that consumes it, because those
   * are different frames and the screen is drawn in between. `useChat` cannot know about
   * a message that has not been handed to it yet, so without this the intake paints once
   * as an empty, idle conversation — the opening question with its suggestion chips under
   * it — before the turn it is already in the middle of catches up. A peek rather than a
   * take: this runs during render, and in development it runs twice.
   */
  const [handedOff, setHandedOff] = useState(hasPendingMessage);

  const { messages, sendMessage, status, error, regenerate, clearError, setMessages, stop } =
    useChat<WayfareUIMessage>({
      onData: (part) => {
        if (part.type === 'data-brief') {
          briefRef.current = part.data;
          setBrief(part.data);
          return;
        }

        // The server's decision about this turn, and the only signal that arrives
        // before the first token — which is when the layout has to be chosen.
        if (part.type === 'data-phase') setPhase(part.data);

        // The turn that will produce no text at all. Deferred rather than handled
        // here: see `refusedRef`.
        if (part.type === 'data-rejection') refusedRef.current = part.data;
      },
    });

  // The gap between arriving with a message and `useChat` being given it. Ends on the
  // render that has the traveller's message in it, which is the same render `status` turns
  // to 'submitted', so the two signals meet without overlapping.
  const opening = handedOff && messages.length === 0;

  const busy = opening || status === 'submitted' || status === 'streaming';

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      clearError();
      setRejection(null);
      sentRef.current = trimmed;
      setInput('');
      setPicked([]);
      void sendMessage({ text: trimmed }, { body: { brief: briefRef.current } });
    },
    [busy, clearError, sendMessage],
  );

  /*
   * Putting the screen back the way it was, once the refused turn has finished.
   *
   * Three things in one place because they are one event: the empty turn comes out
   * of the transcript, the answer goes back in the field where it can be edited,
   * and the note explaining why appears under it. Their order does not matter —
   * they land on the same render — but their being together does, since any one of
   * them alone is a worse state than not having done this at all.
   *
   * `handedOff` is cleared for the case that only exists on the way in from the
   * landing page: removing that turn empties the transcript, and `opening` reads an
   * empty transcript as the message not having been handed over yet. Left set, the
   * screen would sit at "Reading that" forever with the answer line disabled,
   * waiting for a turn that has already been and gone.
   */
  useEffect(() => {
    if (status !== 'ready') return;

    const refused = refusedRef.current;
    if (!refused) return;
    refusedRef.current = null;

    setMessages(withoutRefusedTurn);
    setInput(sentRef.current);
    setRejection(refused);
    setHandedOff(false);
  }, [status, setMessages]);

  // Pick up the message typed on the landing page. The ref guards against the
  // double effect invocation in development strict mode.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const pending = takePendingMessage();
    if (pending) {
      // Recorded for the same reason `send` records it: this answer can be refused
      // too, and the landing page is the one place the traveller cannot get their
      // own words back by pressing the browser's back button.
      sentRef.current = pending;
      void sendMessage({ text: pending }, { body: { brief: emptyTripBrief } });
    }
  }, [sendMessage]);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    // Discarding the conversation puts the message count back to nought, which is half of
    // what says a hand-off is still in flight. Left set, a new trip would open on a
    // question that is being read by nobody.
    setHandedOff(false);
    clearError();
    setBrief(emptyTripBrief);
    briefRef.current = emptyTripBrief;
    setPhase(null);
    setInput('');
    setPicked([]);
  }, [clearError, setMessages, stop]);

  const retry = useCallback(() => {
    void regenerate({ body: { brief: briefRef.current } });
  }, [regenerate]);

  const toggle = useCallback((chip: string) => {
    setPicked((previous) =>
      previous.includes(chip) ? previous.filter((item) => item !== chip) : [...previous, chip],
    );
  }, []);

  const submitPicked = useCallback(() => send(picked.join(', ')), [picked, send]);

  /** The last assistant message is the one the current turn is writing. */
  const lastAssistantId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'assistant') return message.id;
    }
    return null;
  }, [messages]);

  const isCurrentReply = useCallback(
    (messageId: string) => messageId === lastAssistantId,
    [lastAssistantId],
  );

  return {
    messages,
    brief,
    currentStep: nextStep(brief),
    stepIndex: stepIndex(brief),
    busy,
    awaitingReply: opening || status === 'submitted',
    // Falls back to the brief for the turn before the first phase part lands, so
    // a reload mid-conversation does not lose the distinction.
    planning: phase ? phase.kind === TurnKind.PLANNING : isBriefComplete(brief),
    error,
    rejection,

    input,
    setInput,
    picked,
    toggle,

    send,
    submitPicked,
    retry,
    stop,
    reset,

    isCurrentReply,
  };
}
