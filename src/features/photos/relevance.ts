/**
 * Deciding whether a search hit is a photograph of a place someone would visit.
 *
 * Wikipedia's search will answer almost anything with something, and the failures
 * are specific enough to filter by name: a city article leading with a coat of
 * arms, a neighbourhood resolving to a portrait of an etcher, a landmark
 * resolving to a news event that happened near it.
 */

const MIN_SIGNIFICANT_WORD_LENGTH = 4;

/**
 * A page's lead image is often not a photograph — city articles frequently
 * lead with a coat of arms, flag or locator map, which would look broken on a
 * travel card. Cheap to filter by filename.
 */
const NOT_A_PHOTO =
  /(coat[_ ]of[_ ]arms|\bflag\b|\bmap\b|locator|\bseal\b|logo|banner|escudo|bandera|\.svg$|\.ogv$|\.webm$|\.gif$)/i;

/**
 * Search ranks recent news above the landmark itself: "Teotihuacan pyramids"
 * returns a 2026 shooting. A leading year is the giveaway for an event
 * article. War memorials and battlefields are deliberately not excluded —
 * those are real places people visit.
 */
const NOT_A_DESTINATION =
  /^\d{4}\b|\b(shooting|attack|bombing|massacre|murder|riot|protests?|earthquake|crash|disaster|collapse|outbreak|pandemic|epidemic|assassination|kidnapping|scandal|trial|derailment|explosion|flood|wildfire|hurricane|typhoon|tsunami|coup|hijacking)\b/i;

/** Accent-folded words of four or more characters. */
function significantWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= MIN_SIGNIFICANT_WORD_LENGTH);
}

/**
 * Requires the article to share a word with the query.
 *
 * Search happily answers an obscure neighbourhood with a person or an
 * unrelated event — "Ghent Patershol" returns a portrait of an etcher. Prefix
 * matching keeps plurals and accents together ("tacos"/"taco", "Gracia"/
 * "Gràcia") without needing a stemmer.
 */
export function isRelevant(query: string, title: string): boolean {
  const wanted = significantWords(query);
  if (wanted.length === 0) return true;

  const found = significantWords(title);
  return wanted.some((word) =>
    found.some((candidate) => candidate.startsWith(word) || word.startsWith(candidate)),
  );
}

export function isPhotographFile(fileName: string): boolean {
  return !NOT_A_PHOTO.test(fileName);
}

export function isVisitablePlace(title: string): boolean {
  return !NOT_A_DESTINATION.test(title);
}
