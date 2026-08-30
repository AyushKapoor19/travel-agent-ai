import { isToolUIPart } from 'ai';

import type { WayfareMessagePart } from '@/features/agent/messages';
import { TOOL_NAMES } from '@/features/agent/tool-names';

/** Every tool part shares this shape; the union is narrowed where it matters. */
type ToolPart = Extract<WayfareMessagePart, { toolCallId: string }>;

const ACTIVITIES = `tool-${TOOL_NAMES.SEARCH_ACTIVITIES}` as const;

/**
 * What makes a band distinct from another band of the same kind.
 *
 * The tool alone for almost everything: a second climate lookup, a second fare
 * search or a second total supersedes the first rather than joining it. Activities
 * are the exception the prompt asks for — it says to search once or twice to cover
 * the traveller's stated interests, so food and art are two bands, not one band
 * priced twice.
 */
function bandKey(part: ToolPart): string {
  if (part.type !== ACTIVITIES) return part.type;

  // The interest as the call knows it: from the result once there is one, and from
  // the arguments while the search is still running.
  const interest = part.state === 'output-available' ? part.output?.category : part.input?.category;

  return `${ACTIVITIES}:${interest ?? ''}`;
}

/**
 * The tool bands to draw, in the order they were first opened.
 *
 * The model re-runs a tool more often than it looks like it should, and it is
 * usually right to: it prices the trip, settles on a different stay, and prices it
 * again. Drawn naively that printed two "What it comes to" bands with two different
 * totals a screen apart, which is worse than either of them alone — a reader has no
 * way to tell which one is the answer.
 *
 * So a later call replaces an earlier one but keeps its position. The plan reads in
 * the order it was built and every figure on it is the current one.
 */
export function planBands(parts: readonly WayfareMessagePart[]): ToolPart[] {
  const bands = new Map<string, ToolPart>();

  for (const part of parts) {
    if (isToolUIPart(part)) bands.set(bandKey(part), part);
  }

  return [...bands.values()];
}
