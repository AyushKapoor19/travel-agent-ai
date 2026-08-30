import { afterEach, describe, expect, it } from 'vitest';

import { SerpApiEngine } from './constants';
import { activeVendor, Outcome, Vendor } from './vendors';

const ORIGINAL_VENDOR = process.env.SERP_VENDOR;

afterEach(() => {
  if (ORIGINAL_VENDOR === undefined) delete process.env.SERP_VENDOR;
  else process.env.SERP_VENDOR = ORIGINAL_VENDOR;
});

function selectVendor(name: string | undefined): void {
  if (name === undefined) delete process.env.SERP_VENDOR;
  else process.env.SERP_VENDOR = name;
}

/**
 * The switch itself, where the failure mode is silent rather than loud: pointing
 * at the wrong vendor produces a working-looking app that spends someone else's
 * allowance, and a misread status code produces empty cards nobody can trace.
 */
describe('activeVendor', () => {
  it('defaults to SerpApi, so an existing checkout is unaffected', () => {
    selectVendor(undefined);
    expect(activeVendor().label).toBe('SerpApi');
  });

  it('selects Scrapingdog when asked, case- and space-insensitively', () => {
    selectVendor('  ScrapingDog ');
    expect(activeVendor().label).toBe('Scrapingdog');
  });

  it('falls back rather than throwing on a typo', () => {
    // A mistyped environment variable must not take the travel tools down when
    // there is a working default sitting right there.
    selectVendor('scrapingdogg');
    expect(activeVendor().label).toBe('SerpApi');
  });
});

describe('request URLs', () => {
  it('puts the engine in a query parameter for SerpApi', () => {
    selectVendor(Vendor.SERPAPI);
    const url = activeVendor().requestUrl(SerpApiEngine.HOTELS, { q: 'Bali', gl: 'us' }, 'KEY');

    expect(url.startsWith('https://serpapi.com/search.json?')).toBe(true);
    expect(url).toContain('engine=google_hotels');
    expect(url).toContain('q=Bali');
    expect(url).toContain('api_key=KEY');
  });

  it('puts the engine in the path for Scrapingdog and renames its three parameters', () => {
    selectVendor(Vendor.SCRAPINGDOG);
    const url = activeVendor().requestUrl(
      SerpApiEngine.HOTELS,
      { q: 'Bali', gl: 'us', hl: 'en', check_in_date: '2026-03-01' },
      'KEY',
    );

    expect(url.startsWith('https://api.scrapingdog.com/google_hotels?')).toBe(true);
    expect(url).toContain('query=Bali');
    expect(url).toContain('country=us');
    expect(url).toContain('language=en');
    // Everything else is spelled the same, which is what makes this a rename map.
    expect(url).toContain('check_in_date=2026-03-01');
    expect(url).not.toContain('q=Bali');
  });
});

describe('SerpApi classification', () => {
  const serpApi = () => {
    selectVendor(Vendor.SERPAPI);
    return activeVendor();
  };

  it('reads a bare 429 as a throttle rather than a spent month', () => {
    /*
     * The reversal this file exists to record. Every plan caps throughput per
     * hour and that ceiling returns the same untexted 429 exhaustion does.
     * Retrying costs no searches, because failed requests are not billed;
     * refusing to retry kills a turn that would have worked.
     */
    expect(serpApi().classify(429, null)).toBe(Outcome.TRANSIENT);
  });

  it('still reads a stated allowance error as terminal', () => {
    expect(serpApi().classify(429, 'You have run out of searches')).toBe(Outcome.QUOTA);
    expect(serpApi().classify(200, 'You have exceeded your monthly plan')).toBe(Outcome.QUOTA);
  });

  it('treats an upstream silence as an answer, not a failure', () => {
    expect(serpApi().classify(200, "Google hasn't returned any results")).toBe(Outcome.EMPTY);
  });

  it('separates a rejected key from everything else', () => {
    expect(serpApi().classify(401, null)).toBe(Outcome.AUTH);
    expect(serpApi().classify(200, 'Invalid API key')).toBe(Outcome.AUTH);
  });

  it('retries server blips and gives up on everything else', () => {
    expect(serpApi().classify(503, null)).toBe(Outcome.TRANSIENT);
    expect(serpApi().classify(400, null)).toBe(Outcome.FATAL);
    expect(serpApi().classify(200, null)).toBe(Outcome.OK);
  });
});

describe('Scrapingdog classification', () => {
  const scrapingdog = () => {
    selectVendor(Vendor.SCRAPINGDOG);
    return activeVendor();
  };

  it('tells the credit limit apart from the concurrency limit', () => {
    // The distinction SerpApi forces the transport to guess at: here 403 is the
    // month and 429 is only ever too many calls at once.
    expect(scrapingdog().classify(403, null)).toBe(Outcome.QUOTA);
    expect(scrapingdog().classify(429, null)).toBe(Outcome.TRANSIENT);
  });

  it('reads 404 as an empty answer, because it is billed like a successful one', () => {
    expect(scrapingdog().classify(404, null)).toBe(Outcome.EMPTY);
  });

  it('retries the gave-up-internally status, which is not billed', () => {
    expect(scrapingdog().classify(410, null)).toBe(Outcome.TRANSIENT);
  });
});
