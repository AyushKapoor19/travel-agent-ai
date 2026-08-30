/** Resolves after `ms`. Used by the retry ladders and the outbound request pacing. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
