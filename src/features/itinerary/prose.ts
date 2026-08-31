import { isToolUIPart } from 'ai';

import { textFromParts } from '@/features/agent/message-text';
import type { WayfareMessagePart } from '@/features/agent/messages';

/**
 * The reply's prose, with anything it said before it finished searching dropped.
 *
 * A planning turn calls its tools and then writes, in that order, because the
 * prompt requires it — nothing can be said about a stay or a price before the
 * result carrying it has come back. So text that arrives *between* the tool calls
 * is not part of the answer by construction. It is the model narrating: reading the
 * brief back as a list, writing out the searches it is about to run, announcing
 * which kind of turn it has decided this is.
 *
 * That recital carries no headings, so `splitItinerary` has nowhere to put it but
 * the intro, and it was being set as the opening paragraph of the itinerary — above
 * a page of cards drawing the same searches it was describing.
 *
 * The guard is deliberately conditional. Dropping everything before the last tool
 * call unconditionally would blank the page in the one case that matters most: a
 * reply that wrote the whole trip and then made one more call at the end would lose
 * the trip. So the earlier text is only discarded once there is something after the
 * last call to replace it with, which also makes this quiet while the turn streams
 * — the searches run first, and until the prose starts there is nothing to prefer.
 */
export function planProse(parts: readonly WayfareMessagePart[]): string {
  let lastTool = -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part && isToolUIPart(part)) {
      lastTool = index;
      break;
    }
  }

  if (lastTool < 0) return textFromParts(parts);

  const written = textFromParts(parts.slice(lastTool + 1));
  return written.trim() ? written : textFromParts(parts);
}
