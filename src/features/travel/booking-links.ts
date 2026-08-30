/**
 * The hand-off to whoever actually takes the booking.
 *
 * A search on the provider rather than a deep link to a room, because the search
 * is what we can honestly build: the rates come from Google's aggregated results,
 * not from an inventory system that issued us a bookable reference.
 *
 * Both links point at Google, and that is a provenance decision rather than a
 * default. Sending a traveller to Viator under a price Google quoted was the
 * earlier behaviour and it was subtly false — Viator sells guided tours, so a
 * card showing a $4.22 entry ticket handed off to a $60 excursion. The link now
 * lands where the number came from, so the reader can check the figure they were
 * shown.
 */

const GOOGLE_TRAVEL_SEARCH = 'https://www.google.com/travel/search';
const GOOGLE_SEARCH = 'https://www.google.com/search';

export const BookingProvider = {
  HOTELS: 'Google Hotels',
  ACTIVITIES: 'Google',
} as const;

export type HotelSearchLinkOptions = {
  name: string;
  destination: string;
  checkIn?: string;
  checkOut?: string;
};

export function hotelSearchUrl({
  name,
  destination,
  checkIn,
  checkOut,
}: HotelSearchLinkOptions): string {
  const params = new URLSearchParams({ q: `${name} ${destination} hotel` });
  if (checkIn) params.set('checkin', checkIn);
  if (checkOut) params.set('checkout', checkOut);

  return `${GOOGLE_TRAVEL_SEARCH}?${params.toString()}`;
}

export function activitySearchUrl(name: string, destination: string): string {
  const params = new URLSearchParams({ q: `${name} ${destination} tickets` });
  return `${GOOGLE_SEARCH}?${params.toString()}`;
}
