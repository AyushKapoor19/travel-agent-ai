import { placeNameKey } from './place-name-key';

/**
 * Reconciling the names two systems give the same country.
 *
 * Written because exact string comparison silently threw away good answers. The
 * geocoder is asked for English and returns official English — "Republic of
 * Türkiye" — while a language model proposing a destination writes what a traveller
 * would say, "Turkey". Comparing those as strings makes every Turkish city look
 * like it is in the wrong country, and the candidate is dropped as unverifiable.
 * Fethiye died that way, and so did Chania, because the model put "Chania, Crete,
 * Greece" in a field asking for a country.
 *
 * Both failures are the same mistake: treating any disagreement about a name as
 * disagreement about a place. So a country is compared as a set of the names it is
 * known by, and a hint is allowed to arrive as prose.
 */

/**
 * Names that mean one country, canonical form first.
 *
 * Not a complete gazetteer, and not meant to be — a full ISO table would be dead
 * weight when the only cases that matter are the ones where a traveller's word and
 * an official register genuinely differ. Everything else already compares equal
 * once accents and punctuation are folded, which `placeNameKey` does.
 *
 * Constituent countries of the UK are folded in on purpose: a model asked for the
 * country of Edinburgh will say Scotland, and it is not wrong.
 */
const ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['Turkey', 'Türkiye', 'Republic of Türkiye'],
  ['Czech Republic', 'Czechia'],
  ['Netherlands', 'Holland', 'The Netherlands'],
  ['United States', 'United States of America', 'USA', 'US', 'America'],
  [
    'United Kingdom',
    'UK',
    'Great Britain',
    'Britain',
    'England',
    'Scotland',
    'Wales',
    'Northern Ireland',
  ],
  ['United Arab Emirates', 'UAE'],
  ['South Korea', 'Korea, South', 'Republic of Korea'],
  ['North Korea', 'Korea, North', "Democratic People's Republic of Korea"],
  ['North Macedonia', 'Macedonia'],
  ['Myanmar', 'Burma'],
  ['Cape Verde', 'Cabo Verde'],
  ['Ivory Coast', "Côte d'Ivoire"],
  ['Eswatini', 'Swaziland'],
  ['East Timor', 'Timor-Leste'],
  ['Vatican City', 'Holy See'],
  ['Russia', 'Russian Federation'],
  ['Vietnam', 'Viet Nam'],
  ['Laos', "Lao People's Democratic Republic"],
  ['Syria', 'Syrian Arab Republic'],
  ['Iran', 'Islamic Republic of Iran', 'Persia'],
  ['Tanzania', 'United Republic of Tanzania'],
  ['Bolivia', 'Plurinational State of Bolivia'],
  ['Venezuela', 'Bolivarian Republic of Venezuela'],
  ['Moldova', 'Republic of Moldova'],
  ['Brunei', 'Brunei Darussalam'],
  ['Democratic Republic of the Congo', 'DR Congo', 'DRC', 'Congo-Kinshasa', 'Zaire'],
  ['Republic of the Congo', 'Congo-Brazzaville'],
  ['Ireland', 'Republic of Ireland', 'Eire'],
  ['Gambia', 'The Gambia'],
  ['Bahamas', 'The Bahamas'],
  ['Philippines', 'The Philippines'],
  ['Egypt', 'Arab Republic of Egypt'],
  ['Greece', 'Hellenic Republic'],
];

/**
 * A leading form-of-state, which carries no information about which country it is.
 *
 * "United" is deliberately absent from the adjectives: stripping it would turn
 * "United States of America" into "America" and "United Republic of Tanzania" into
 * "Tanzania" by a route that also mangles the United Kingdom. Those three are
 * spelled out above instead, where the intent is visible.
 */
const STATE_FORM_PREFIX =
  /^(?:the\s+)?(?:(?:socialist|islamic|democratic|federal|federative|plurinational|bolivarian|arab|oriental|hellenic|people'?s)\s+)*(?:republic|kingdom|state|commonwealth|principality|sultanate|emirate|federation|union)\s+of\s+(?:the\s+)?/i;

const GROUP_FOR_KEY = new Map<string, readonly string[]>();
for (const group of ALIAS_GROUPS) {
  for (const name of group) GROUP_FOR_KEY.set(placeNameKey(name), group);
}

/** Every name this country answers to, folded for comparison. */
function countryKeys(name: string): Set<string> {
  const keys = new Set<string>();
  const trimmed = name.trim();
  if (!trimmed) return keys;

  /*
   * A name the alias table already knows is answered by its group alone, and the
   * prefix is deliberately not stripped off it.
   *
   * Stripping reduces both "Republic of the Congo" and "Democratic Republic of the
   * Congo" to "Congo", which made them compare equal — a false positive, and those
   * are the expensive direction: a candidate verified against the wrong country
   * carries the wrong weather, the wrong rates and the wrong photograph onto the
   * card. Names the table does not list still fall through to stripping below,
   * which is what "Kingdom of Morocco" needs.
   */
  const listed = GROUP_FOR_KEY.get(placeNameKey(trimmed));
  if (listed) {
    for (const member of listed) keys.add(placeNameKey(member));
    return keys;
  }

  for (const variant of [trimmed, trimmed.replace(STATE_FORM_PREFIX, '')]) {
    const key = placeNameKey(variant);
    if (!key) continue;

    keys.add(key);
    for (const member of GROUP_FOR_KEY.get(key) ?? []) keys.add(placeNameKey(member));
  }

  return keys;
}

/**
 * Whether a geocoder result sits in the country the caller expected.
 *
 * The hint is tested whole and also comma-part by comma-part, because it is written
 * by a language model and arrives as "Chania, Crete, Greece" often enough to matter.
 * Any part naming the right country confirms it — a region or a city alongside is
 * extra detail, not a contradiction.
 */
export function sameCountry(actual: string | undefined, hint: string): boolean {
  if (!actual) return false;

  const actualKeys = countryKeys(actual);
  if (actualKeys.size === 0) return false;

  return [hint, ...hint.split(',')].some((part) => {
    for (const key of countryKeys(part)) {
      if (actualKeys.has(key)) return true;
    }
    return false;
  });
}

/**
 * The name a traveller would recognise, for labels and for search queries.
 *
 * Both uses need it. "Republic of Türkiye" is wrong on a card in a way that reads
 * as a bug, and it is actively harmful in a Wikipedia query: searching "Fethiye,
 * Republic of Türkiye" surfaces the 2023 earthquake, while "Fethiye, Turkey"
 * surfaces the town.
 */
export function shortCountryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';

  const stripped = trimmed.replace(STATE_FORM_PREFIX, '').trim();

  for (const variant of [trimmed, stripped]) {
    const group = GROUP_FOR_KEY.get(placeNameKey(variant));
    if (group?.[0]) return group[0];
  }

  return stripped || trimmed;
}
