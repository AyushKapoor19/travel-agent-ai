import type { ActivityResult } from '@/features/travel/types';
import { formatCount, formatPrice } from '@/lib/format';
import { nameKey } from '@/lib/name-key';

import { ResultCard } from './result-card';

/**
 * Said when the photograph is of somewhere else in the same city.
 *
 * Wikipedia has an article for Tanah Lot and none for a neighbourhood
 * restaurant, so the lookup falls back to a nearby landmark — a card for "A Nossa
 * Casa" came back illustrated with Lisbon Cathedral. The photo is still worth
 * showing and the caption is what stops it being a claim.
 */
const NEARBY_CAPTION = 'Nearby';

type ActivityCardProps = {
  activity: ActivityResult;
  index: number;
};

/** An activity, as a result card. See `HotelCard`: this is the mapping and nothing else. */
export function ActivityCard({ activity, index }: ActivityCardProps) {
  return (
    <ResultCard
      index={index}
      seed={activity.id}
      title={activity.name}
      rating={activity.rating}
      kind={activity.category ?? 'To do'}
      meta={metaLine(activity)}
      description={activity.description ?? ''}
      image={activity.image}
      photoNote={photoCaption(activity)}
      price={priceLine(activity)}
      bookingUrl={activity.bookingUrl}
      provider={activity.provider}
      // The link leads back to Google, which is where the rating and the entry
      // price came from, so it is not a reservation and does not claim to be.
      actionLabel="View on"
    />
  );
}

/**
 * How many people rated it, and nothing when nobody has.
 *
 * An obscure attraction with no review count should show one fact rather than a
 * fabricated second one. Google's classification is passed as the kind instead, so
 * it sits where a stay's property type sits and is not printed twice.
 */
function metaLine(activity: ActivityResult): string {
  return activity.reviewCount > 0 ? `${formatCount(activity.reviewCount)} reviews` : '';
}

/**
 * The source's own wording wins over a formatted figure.
 *
 * "Free" and a band like "$10–20" say something a rounded number cannot, and an
 * entry price of $7.32 is more use printed as charged than rounded to $7.
 */
function priceLine(activity: ActivityResult): string | null {
  return activity.priceLabel ?? formatPrice(activity.price, activity.currency);
}

/** Undefined when the photo is of the place itself, which needs no qualifying. */
function photoCaption(activity: ActivityResult): string | undefined {
  const subject = activity.image?.subject;
  if (!subject) return undefined;

  return nameKey(subject) === nameKey(activity.name) ? undefined : NEARBY_CAPTION;
}
