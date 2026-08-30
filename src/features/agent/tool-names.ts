/**
 * The tool names the model sees, and the keys the UI switches on.
 *
 * Apart from the tools themselves because both sides need them and only one side
 * may have the implementations: the renderer matches `tool-search_hotels` parts
 * off these, while `./tools` reaches a provider and is server-only. One name in
 * one place, so a rename cannot leave the prompt contract and the renderer
 * disagreeing — which fails as a card that silently never appears.
 */
export const TOOL_NAMES = {
  RECOMMEND_DESTINATIONS: 'recommend_destinations',
  GET_WEATHER: 'get_weather',
  SEARCH_HOTELS: 'search_hotels',
  SEARCH_ACTIVITIES: 'search_activities',
  SEARCH_FLIGHTS: 'search_flights',
  ESTIMATE_COSTS: 'estimate_costs',
} as const;
