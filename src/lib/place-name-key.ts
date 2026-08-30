/**
 * A place name reduced to the part two sources agree on.
 *
 * Never displayed. It exists because the same landmark arrives spelled slightly
 * differently from every direction — Google writes "The Louvre" where Wikipedia
 * writes "Louvre Museum", and diacritics survive one hop but not the next — and
 * two jobs here need to decide whether two spellings mean one place: joining
 * Google's local results to its top-sights block, and checking whether a
 * photograph is actually of the thing on the card.
 *
 * Both were doing it with their own private normaliser, which is exactly how the
 * two answers drift apart.
 */
export function placeNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}
