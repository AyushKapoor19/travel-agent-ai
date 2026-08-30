import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SerpApiEngine } from './constants';
import { Vendor, vendorFor } from './vendors';

/** Restored between cases, since selection reads the environment at call time. */
const ENVIRONMENT = { ...process.env };

beforeEach(() => {
  process.env.SERP_VENDOR = Vendor.SCRAPINGDOG;
  process.env.SCRAPINGDOG_KEY = 'present';
});

afterEach(() => {
  for (const name of ['SERP_VENDOR', 'SCRAPINGDOG_KEY', 'SERPAPI_KEY']) {
    const original = ENVIRONMENT[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

/**
 * The reshaping, tested against the shapes a live Scrapingdog response actually
 * had rather than the ones its documentation promises. Every case here is a real
 * discrepancy found by calling the endpoints, and two of them would have shipped
 * visibly wrong numbers rather than an error.
 */

const scrapingdog = () => vendorFor(SerpApiEngine.HOTELS);

function normalizeHotels(body: unknown): Record<string, unknown>[] {
  const { properties } = scrapingdog().normalize(SerpApiEngine.HOTELS, body) as {
    properties: Record<string, unknown>[];
  };

  return properties;
}

/** The single property each case below is about, past the index check. */
function onlyProperty(body: unknown): Record<string, unknown> {
  const properties = normalizeHotels(body);
  expect(properties).toHaveLength(1);

  return properties[0] as Record<string, unknown>;
}

describe('Scrapingdog hotel responses', () => {
  it('maps title onto the name the schema requires', () => {
    // `name` is the one non-optional field, so without this the array fails to
    // parse and the destination reports no hotels at all.
    const property = onlyProperty({
      properties: [{ title: 'Villa Simone Bali', rate_per_night: { extracted_lowest: 139 } }],
    });

    expect(property.name).toBe('Villa Simone Bali');
  });

  it('un-swaps a transposed rating and review count', () => {
    // Observed verbatim: the St. Regis came back as 2,803 stars and 4.8 reviews.
    const property = onlyProperty({
      properties: [{ title: 'The St. Regis Bali Resort', overall_rating: 2803, reviews: 4.8 }],
    });

    expect(property.overall_rating).toBe(4.8);
    expect(property.reviews).toBe(2803);
  });

  it('leaves a correctly ordered pair alone', () => {
    // So the fix becomes a no-op the day the upstream parser is corrected,
    // rather than reintroducing the same bug from the other direction.
    const property = onlyProperty({
      properties: [{ title: 'Anywhere', overall_rating: 4.7, reviews: 15068 }],
    });

    expect(property.overall_rating).toBe(4.7);
    expect(property.reviews).toBe(15068);
  });

  it('does not invent a rating for a property that has none', () => {
    const property = onlyProperty({ properties: [{ title: 'Unrated' }] });

    expect(property.overall_rating).toBeUndefined();
    expect(property.reviews).toBeUndefined();
  });

  it('decodes an escape sequence left in the name', () => {
    // Arrived verbatim as "Desa Swan Villas \u0026 SPA", escape and all.
    const property = onlyProperty({
      properties: [{ title: 'Desa Swan Villas \\u0026 SPA' }],
    });

    expect(property.name).toBe('Desa Swan Villas & SPA');
  });

  it('survives a response with nothing in it', () => {
    expect(normalizeHotels({})).toEqual([]);
    expect(scrapingdog().normalize(SerpApiEngine.HOTELS, null)).toBeNull();
  });
});

describe('Scrapingdog flight responses', () => {
  /** The trip types as they survive the reshaping, in order. */
  function tripTypes(body: unknown): unknown[] {
    const vendor = vendorFor(SerpApiEngine.FLIGHTS);
    const out = vendor.normalize(SerpApiEngine.FLIGHTS, body) as {
      best_flights: Record<string, unknown>[];
      other_flights: Record<string, unknown>[];
    };

    return [...out.best_flights, ...out.other_flights].map((itinerary) => itinerary.type);
  }

  it('lowercases the trip type so the round-trip flag is not inverted', () => {
    // `flights.ts` reads `type !== 'One way'`, and Scrapingdog only ever searches
    // one-way, so its "One Way" would have labelled every fare a return.
    expect(
      tripTypes({
        best_flights: [{ type: 'One Way', price: 1108 }],
        other_flights: [{ type: 'Round trip' }],
      }),
    ).toEqual(['One way', 'Round trip']);
  });

  it('survives a response with no itineraries', () => {
    expect(tripTypes({})).toEqual([]);
  });
});

describe('engine coverage', () => {
  it('keeps activities on SerpApi even when Scrapingdog is chosen', () => {
    // Scrapingdog serves no top-sights block and a local pack with no ratings,
    // so routing activities there would empty every list without erroring.
    process.env.SERPAPI_KEY = 'present';

    expect(vendorFor(SerpApiEngine.LOCAL).label).toBe('SerpApi');
    expect(vendorFor(SerpApiEngine.GOOGLE).label).toBe('SerpApi');
    expect(vendorFor(SerpApiEngine.HOTELS).label).toBe('Scrapingdog');
    expect(vendorFor(SerpApiEngine.FLIGHTS).label).toBe('Scrapingdog');
  });

  it('does not fall back to a vendor nobody configured', () => {
    // A missing-key error would misreport the situation; an empty activity list
    // is the honest account of what happened.
    delete process.env.SERPAPI_KEY;

    expect(vendorFor(SerpApiEngine.LOCAL).label).toBe('Scrapingdog');
  });
});
