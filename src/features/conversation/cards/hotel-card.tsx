import type { HotelResult } from '@/features/travel/types';
import { formatCount, formatPrice, formatStars } from '@/lib/format';
import { nameKey } from '@/lib/name-key';

import { ResultCard } from './result-card';

const PRICE_UNIT = '/ night';

/**
 * Appended when the rate covers more than one room.
 *
 * The price is per night either way, so the unit alone would read as a single room's
 * rate and make the stay look twice as expensive as its competitors on the same grid.
 */
function priceUnitFor(rooms: number): string {
  return rooms > 1 ? `${PRICE_UNIT}, ${rooms} rooms` : PRICE_UNIT;
}

/** Said when the photograph is of somewhere else in the same city. */
const NEARBY_CAPTION = 'Nearby';

type HotelCardProps = {
  hotel: HotelResult;
  index: number;
};

/**
 * A stay, as a result card.
 *
 * Nothing here but the mapping: which field is the title, how a star class and a
 * review count become one line, and what the price is per. The layout is the
 * shared card's business.
 */
export function HotelCard({ hotel, index }: HotelCardProps) {
  return (
    <ResultCard
      index={index}
      seed={hotel.id}
      title={hotel.name}
      rating={hotel.rating}
      kind={hotel.type ?? 'Stay'}
      meta={metaLine(hotel)}
      description={hotel.description ?? ''}
      image={hotel.image}
      photoNote={photoCaption(hotel)}
      price={formatPrice(hotel.pricePerNight, hotel.currency)}
      priceUnit={priceUnitFor(hotel.rooms)}
      note={hotel.amenities.join(' · ') || undefined}
      bookingUrl={hotel.bookingUrl}
      provider={hotel.provider}
    />
  );
}

/**
 * Star class and how many people rated it, each dropped when Google does not
 * classify the property rather than defaulted to something that looks measured.
 */
function metaLine(hotel: HotelResult): string {
  const parts = [
    hotel.stars === null ? null : formatStars(hotel.stars),
    hotel.reviewCount > 0 ? `${formatCount(hotel.reviewCount)} reviews` : null,
  ];

  return parts.filter(Boolean).join(' · ');
}

/** Undefined when the photo is of the property itself, which needs no qualifying. */
function photoCaption(hotel: HotelResult): string | undefined {
  const subject = hotel.image?.subject;
  if (!subject) return undefined;

  return nameKey(subject) === nameKey(hotel.name) ? undefined : NEARBY_CAPTION;
}
