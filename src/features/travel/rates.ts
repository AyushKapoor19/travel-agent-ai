import type { HotelResult } from './types';

/**
 * The properties Google actually put a nightly rate on, cheapest first.
 *
 * Both callers that price a stay want the same two things from a set of results —
 * the cheapest real quote, and how many quotes it was picked from — and both were
 * asking for it in their own words. A rate of zero is not a free room, it is a
 * property Google declined to price, so it is filtered out rather than sorted to
 * the front where it would become the floor.
 *
 * Its own file rather than a second export from `hotels`, because everything that
 * reads a rate mocks the provider wholesale in tests, and reaching a pure function
 * through a mocked module means every one of those mocks has to remember it.
 */
export function quotedCheapestFirst(hotels: readonly HotelResult[]): HotelResult[] {
  return hotels
    .filter((hotel) => hotel.pricePerNight !== null && hotel.pricePerNight > 0)
    .sort((a, b) => (a.pricePerNight ?? 0) - (b.pricePerNight ?? 0));
}
