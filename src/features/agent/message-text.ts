/**
 * Reading the prose out of a UI message.
 *
 * A message is a list of parts — text, tool calls, transient data — and pulling
 * the text back out of it was written three separate times: once on the server
 * to feed extraction, twice on the client to render. The two uses want different
 * joins, which is the only reason there are two functions here rather than one.
 */

type MessagePartLike = { readonly type: string };

type TextPart = { readonly type: 'text'; readonly text: string };

function isTextPart(part: MessagePartLike): part is TextPart {
  return part.type === 'text';
}

/**
 * The text as written, for rendering.
 *
 * Joined with nothing: while a reply streams, its text arrives as consecutive
 * chunks of one sentence, and anything between them would insert spaces into
 * the middle of words.
 */
export function textFromParts(parts: ReadonlyArray<MessagePartLike>): string {
  return parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('');
}

export function messageText(message: { readonly parts: ReadonlyArray<MessagePartLike> }): string {
  return textFromParts(message.parts);
}

/**
 * What the traveller last said, for the model to extract from.
 *
 * Joined with a space and trimmed: a completed message's parts are separate
 * utterances rather than fragments of one, so running them together would invent
 * words that were never typed.
 */
export function lastUserText(
  messages: ReadonlyArray<{
    readonly role: string;
    readonly parts: ReadonlyArray<MessagePartLike>;
  }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'user') continue;

    return message.parts
      .filter(isTextPart)
      .map((part) => part.text)
      .join(' ')
      .trim();
  }

  return '';
}
