export type FeaturedDestination = {
  city: string;
  /**
   * Spelled out rather than an ISO code. Two letters are what a departure board
   * prints because a board has no room; this is a printed index with a whole
   * column to spare, and "PT" beside Lisbon asks the reader to decode something
   * for nothing in return.
   */
  country: string;
  /** The message the conversation opens with when this line is chosen. */
  prompt: string;
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
  { city: 'Lisbon', country: 'Portugal', prompt: 'Five days in Lisbon', query: 'Alfama Lisbon' },
  {
    city: 'Tokyo',
    country: 'Japan',
    prompt: 'A week in Tokyo in cherry blossom season',
    query: 'Shibuya Tokyo',
  },
  {
    city: 'Mexico City',
    country: 'Mexico',
    prompt: 'Four days in Mexico City',
    query: 'Coyoacán Mexico City',
  },
  {
    city: 'Barcelona',
    country: 'Spain',
    prompt: 'A long weekend in Barcelona',
    query: 'Gothic Quarter Barcelona',
  },
  { city: 'Kyoto', country: 'Japan', prompt: 'Five days in Kyoto in autumn', query: 'Gion Kyoto' },
  {
    city: 'Copenhagen',
    country: 'Denmark',
    prompt: 'A long weekend in Copenhagen',
    query: 'Nyhavn Copenhagen',
  },
  {
    city: 'Marrakesh',
    country: 'Morocco',
    prompt: 'Four days in Marrakesh',
    query: 'Jemaa el-Fnaa Marrakesh',
  },
  {
    city: 'Cape Town',
    country: 'South Africa',
    prompt: 'A week in Cape Town',
    query: 'Bo-Kaap Cape Town',
  },
];

/**
 * Hoisted to module scope rather than derived in the component: it is the
 * dependency of the lookup effect, and a fresh array every render would refetch
 * eight photographs on every frame the index is re-rendered.
 */
export const DESTINATION_QUERIES = FEATURED_DESTINATIONS.map((destination) => destination.query);
