/**
 * Carries the landing-page message into /chat.
 *
 * sessionStorage rather than a query param: the message is prose that would be
 * ugly and length-limited in a URL, and this is the same mechanism that will
 * preserve an in-progress trip through the sign-up modal once auth exists.
 */
const PENDING_MESSAGE_KEY = 'wayfare:pending-message';

export function setPendingMessage(text: string): void {
  try {
    sessionStorage.setItem(PENDING_MESSAGE_KEY, text);
  } catch {
    // Safari private mode throws on write; the chat simply opens empty.
  }
}

/**
 * Whether a message is waiting, without consuming it.
 *
 * The chat needs this during its first render, before the effect that sends the message
 * has run: for that one render the conversation is empty and idle, and a screen drawn
 * from those two facts is a fresh intake — suggestion chips and all — flashing up on the
 * way in from the landing page.
 */
export function hasPendingMessage(): boolean {
  try {
    return sessionStorage.getItem(PENDING_MESSAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function takePendingMessage(): string | null {
  try {
    const text = sessionStorage.getItem(PENDING_MESSAGE_KEY);
    if (text) sessionStorage.removeItem(PENDING_MESSAGE_KEY);
    return text;
  } catch {
    return null;
  }
}
