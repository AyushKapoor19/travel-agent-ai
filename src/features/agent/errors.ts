import 'server-only';

import { API_KEY_ENV } from './provider';

/**
 * Provider failures, translated into something the traveller can act on.
 *
 * A raw SDK message names an HTTP status and a Google API surface, which tells a
 * reader nothing about what to do next. Matched on the message rather than on a
 * status code because the SDK wraps several transports and the text is the only
 * thing all of them carry.
 */

type ErrorAdvice = {
  match: RegExp;
  advice: string;
};

const PROVIDER_ERRORS: readonly ErrorAdvice[] = [
  {
    match: /429|rate limit|resource_exhausted|quota/i,
    advice: 'The free tier is rate limited and we just hit it. Wait a few seconds and try again.',
  },
  {
    match: /api key|permission|unauthenticated|401|403/i,
    advice: `Your ${API_KEY_ENV} was rejected. Check the key in .env.local.`,
  },
  {
    match: /no longer available|not found|404/i,
    advice:
      'That model is not available to this API key. Set TRAVEL_AGENT_MODEL to a current Gemini model.',
  },
  {
    match: /ENOTFOUND|ETIMEDOUT|fetch failed|Cannot connect/i,
    advice: 'Could not reach the model provider. Check your connection and try again.',
  },
];

const GENERIC_ADVICE = 'Something went wrong. Please try again.';

export function describeModelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  const known = PROVIDER_ERRORS.find((candidate) => candidate.match.test(message));
  if (known) return known.advice;

  return message || GENERIC_ADVICE;
}

export function missingApiKeyMessage(): string {
  return `${API_KEY_ENV} is not set. Copy .env.example to .env.local and add your key.`;
}
