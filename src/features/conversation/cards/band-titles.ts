/**
 * What each band of the plan is called.
 *
 * Named in one place because two things need to agree about them. The tool results
 * print them as headings, and the document has to recognise one when the model writes
 * the same heading over a paragraph of its own — which it does, because it is asked to
 * recommend a stay and a recommendation feels like it wants a title.
 *
 * The result was "WHERE TO STAY" over three plates, then "WHERE TO STAY" again over a
 * paragraph about one of them, which reads as a document that has lost its place.
 */
export const BAND_TITLE = {
  DESTINATIONS: 'Where you could go',
  WEATHER: 'Weather',
  HOTELS: 'Where to stay',
  ACTIVITIES: 'What to do',
  FLIGHTS: 'Getting there',
  COSTS: 'What it comes to',
} as const;

/** The activities band names the interest it covers, e.g. "To do: food". */
export function activitiesTitle(category: string | null): string {
  return category ? `To do: ${category}` : BAND_TITLE.ACTIVITIES;
}

/** Case, spacing and a trailing colon or full stop are not differences in a heading. */
function normalize(title: string): string {
  return title
    .trim()
    .replace(/[:.]+$/, '')
    .toLowerCase();
}

const TAKEN = new Set(Object.values(BAND_TITLE).map(normalize));

/** How an activities heading starts, so "To do: food" is recognised as one. */
const ACTIVITIES_PREFIX = 'to do';

/**
 * Whether the document already prints this heading as a band of its own.
 *
 * Used to drop the duplicate rather than the paragraph: the prose under it is usually
 * worth reading — why that stay suits this trip — it is only the second heading that
 * is wrong.
 */
export function isBandTitle(title: string): boolean {
  const normalized = normalize(title);

  return TAKEN.has(normalized) || normalized.startsWith(ACTIVITIES_PREFIX);
}
