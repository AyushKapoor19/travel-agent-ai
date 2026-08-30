import { z } from 'zod';

import { MAX_CREDIT_LENGTH, MAX_LICENSE_TITLES, UNKNOWN_CREDIT } from './constants';
import type { PhotoLicense } from './types';
import { callWikipedia } from './wikipedia-api';

/**
 * Author and licence for the files we are about to display.
 *
 * Not optional decoration: crediting the photographer is a condition of the
 * licence the photograph is offered under, which is why a failure here degrades
 * to "Wikimedia Commons" rather than to nothing.
 */

const licenseResponseSchema = z.object({
  query: z
    .object({
      pages: z
        .array(
          z.object({
            title: z.string(),
            imageinfo: z
              .array(
                z.object({
                  extmetadata: z
                    .object({
                      Artist: z.object({ value: z.string() }).optional(),
                      LicenseShortName: z.object({ value: z.string() }).optional(),
                      LicenseUrl: z.object({ value: z.string() }).optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

/** extmetadata values arrive as HTML, e.g. an anchor around the author name. */
function plainText(value: string | undefined): string {
  if (!value) return '';

  return (
    value
      // Space, not empty: sibling tags otherwise fuse into "Unknown authorUnknown author".
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      // Commons frequently repeats the author in both a link and its label.
      .replace(/\b(.{3,40}?)\s+\1\b/gi, '$1')
      // Tidy the spaces the tag stripping leaves inside brackets.
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .trim()
      .slice(0, MAX_CREDIT_LENGTH)
      .trim()
  );
}

/**
 * One batched call covers every image in an itinerary.
 *
 * Keyed on both the spaced and underscored form of each filename: the API
 * normalises titles on the way back, and the caller holds whichever form search
 * gave it.
 */
export async function fetchLicenses(fileNames: string[]): Promise<Map<string, PhotoLicense>> {
  const licenses = new Map<string, PhotoLicense>();
  if (fileNames.length === 0) return licenses;

  const titles = fileNames.slice(0, MAX_LICENSE_TITLES).map((name) => `File:${name}`);

  const raw = await callWikipedia({
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
  });

  const parsed = licenseResponseSchema.safeParse(raw);
  if (!parsed.success) return licenses;

  for (const page of parsed.data.query?.pages ?? []) {
    const meta = page.imageinfo?.[0]?.extmetadata;
    const key = page.title.replace(/^File:/, '');

    const entry: PhotoLicense = {
      credit: plainText(meta?.Artist?.value) || UNKNOWN_CREDIT,
      license: plainText(meta?.LicenseShortName?.value),
      licenseUrl: meta?.LicenseUrl?.value ?? '',
    };

    licenses.set(key, entry);
    licenses.set(key.replace(/ /g, '_'), entry);
  }

  return licenses;
}

/** Both spellings of a filename, since search and the metadata API disagree. */
export function licenseFor(
  licenses: Map<string, PhotoLicense>,
  fileName: string,
): PhotoLicense | undefined {
  return licenses.get(fileName) ?? licenses.get(fileName.replace(/_/g, ' '));
}
