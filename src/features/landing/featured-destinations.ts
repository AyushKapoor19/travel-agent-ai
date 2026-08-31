export type FeaturedDestination = {
  city: string;
  /**
   * Spelled out rather than an ISO code. Two letters are what a departure board
   * prints because a board has no room; this is a printed index with a whole
   * column to spare, and "PT" beside Lisbon asks the reader to decode something
   * for nothing in return.
   */
  country: string;
  /**
   * What to look up a photograph of. A neighbourhood rather than the city,
   * because a city article's lead image is often a montage or a map, and a
   * neighbourhood returns a photograph of somewhere you would actually stand.
   */
  query: string;
};

/**
 * Cities to open a conversation with.
 *
 * The first four have curated stays and activities behind them, so they lead;
 * the rest fall through to the generic seed set, which returns plausible,
 * correctly-priced results for anywhere.
 */
export const FEATURED_DESTINATIONS: readonly FeaturedDestination[] = [
  { city: 'Lisbon', country: 'Portugal', query: 'Alfama Lisbon' },
  { city: 'Tokyo', country: 'Japan', query: 'Shibuya Tokyo' },
  { city: 'Mexico City', country: 'Mexico', query: 'Coyoacán Mexico City' },
  { city: 'Barcelona', country: 'Spain', query: 'Gothic Quarter Barcelona' },
  { city: 'Kyoto', country: 'Japan', query: 'Gion Kyoto' },
  { city: 'Copenhagen', country: 'Denmark', query: 'Nyhavn Copenhagen' },
  { city: 'Marrakesh', country: 'Morocco', query: 'Jemaa el-Fnaa Marrakesh' },
  { city: 'Cape Town', country: 'South Africa', query: 'Bo-Kaap Cape Town' },
];

/**
 * The message the conversation opens with when a line is chosen.
 *
 * The place, and nothing the line did not print. A prompt carrying a length —
 * "Five days in Lisbon" — puts a decision in the reader's mouth that they never
 * saw on screen, and the dates step then closes on an answer nobody gave. So a
 * press fills in the one field the list is actually about and the interview asks
 * for the rest.
 *
 * The country comes along because city names are not unique and the line already
 * prints it, so sending it spares the geocoder a guess and costs the reader
 * nothing they were not already looking at.
 */
export function destinationPrompt(destination: FeaturedDestination): string {
  return `${destination.city}, ${destination.country}`;
}

/**
 * Hoisted to module scope rather than derived in the component: it is the
 * dependency of the lookup effect, and a fresh array every render would refetch
 * eight photographs on every frame the index is re-rendered.
 */
export const DESTINATION_QUERIES = FEATURED_DESTINATIONS.map((destination) => destination.query);
