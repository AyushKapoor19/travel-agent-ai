export type Flag = {
  /** ISO 3166-1 alpha-2, lowercase — also the SVG's filename under /flags. */
  code: string;
  name: string;
  /** A colour lifted from the flag, used at low alpha to cast its pane of glass. */
  tint: string;
};

/**
 * The countries, in the order they fan across the screen.
 *
 * The first seven are the destinations the index above offers, so the field opens
 * as a restatement of what the page has already shown and only then goes
 * wandering.
 */
export const FLAGS: readonly Flag[] = [
  { code: 'pt', name: 'Portugal', tint: '#006600' },
  { code: 'jp', name: 'Japan', tint: '#bc002d' },
  { code: 'mx', name: 'Mexico', tint: '#006847' },
  { code: 'es', name: 'Spain', tint: '#c60b1e' },
  { code: 'dk', name: 'Denmark', tint: '#c8102e' },
  { code: 'ma', name: 'Morocco', tint: '#c1272d' },
  { code: 'za', name: 'South Africa', tint: '#007749' },
  { code: 'it', name: 'Italy', tint: '#008c45' },
  { code: 'fr', name: 'France', tint: '#0055a4' },
  { code: 'gr', name: 'Greece', tint: '#0d5eaf' },
  { code: 'is', name: 'Iceland', tint: '#02529c' },
  { code: 'pe', name: 'Peru', tint: '#d91023' },
  { code: 'th', name: 'Thailand', tint: '#2d2a4a' },
  { code: 'br', name: 'Brazil', tint: '#009b3a' },
  { code: 'vn', name: 'Vietnam', tint: '#da251d' },
  { code: 'tr', name: 'Türkiye', tint: '#e30a17' },
  { code: 'in', name: 'India', tint: '#ff9933' },
  { code: 'no', name: 'Norway', tint: '#ba0c2f' },
  { code: 'au', name: 'Australia', tint: '#012169' },
  { code: 'ca', name: 'Canada', tint: '#d80621' },
];
