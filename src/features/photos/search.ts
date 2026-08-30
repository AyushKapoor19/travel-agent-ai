import { z } from 'zod';

import { SEARCH_CANDIDATES, UNRANKED } from './constants';
import { isPhotographFile, isRelevant, isVisitablePlace } from './relevance';
import type { ImageCandidate } from './types';
import { callWikipedia } from './wikipedia-api';

/** Finding which article's lead photograph should stand for a place. */

const searchResponseSchema = z.object({
  query: z
    .object({
      pages: z
        .array(
          z.object({
            title: z.string(),
            /** Search rank. The pages array itself is not ordered by relevance. */
            index: z.number().optional(),
            thumbnail: z
              .object({ source: z.string(), width: z.number(), height: z.number() })
              .optional(),
            pageimage: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

function articleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/**
 * The best usable hit for a query, or null when nothing survives filtering.
 *
 * @throws TransientImageError when the API declined to answer, which the caller
 * must not record as "this place has no photograph".
 */
export async function findCandidate(query: string, width: number): Promise<ImageCandidate | null> {
  const raw = await callWikipedia({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(SEARCH_CANDIDATES),
    gsrnamespace: '0',
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: String(width),
    // pilimit defaults to 1, so without this only one page in the batch comes
    // back with thumbnail data and the other candidates look image-less.
    pilimit: String(SEARCH_CANDIDATES),
  });

  const parsed = searchResponseSchema.safeParse(raw);
  if (!parsed.success) return null;

  // Sort by search rank first, or a query like "Alfama Lisbon" resolves to the
  // broader "Lisbon" article and every stay in the city gets the same photo.
  const ranked = [...(parsed.data.query?.pages ?? [])].sort(
    (a, b) => (a.index ?? UNRANKED) - (b.index ?? UNRANKED),
  );

  for (const page of ranked) {
    const fileName = page.pageimage ?? '';
    if (!page.thumbnail || !fileName) continue;
    if (!isPhotographFile(fileName)) continue;
    if (!isVisitablePlace(page.title)) continue;
    if (!isRelevant(query, page.title)) continue;

    return {
      query,
      subject: page.title,
      pageUrl: articleUrl(page.title),
      url: page.thumbnail.source,
      width: page.thumbnail.width,
      height: page.thumbnail.height,
      fileName,
    };
  }

  return null;
}
