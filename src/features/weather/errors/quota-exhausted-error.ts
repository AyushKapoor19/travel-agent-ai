import { TransientWeatherError } from './transient-weather-error';

/**
 * The day's allowance is spent, and no amount of waiting inside this request will
 * bring it back.
 *
 * A subclass because every decision made about a `TransientWeatherError` is still
 * the right one — nothing is cached, and nothing is reported as a fact about the
 * place. Only the retry ladder needs to tell the two apart, and it badly does:
 * Open-Meteo answers both a momentary per-IP collision and an exhausted daily
 * quota with a bare 429, and the ladder treated the second as the first. Five
 * candidates against a spent quota meant twenty more refused requests and a
 * minute of backoff, all to arrive where the first response already said.
 */
export class QuotaExhaustedError extends TransientWeatherError {
  override readonly name = 'QuotaExhaustedError';
}
