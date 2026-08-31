type RouteWaitProps = {
  /** What is being waited for. Read out to assistive technology as well as drawn. */
  label: string;
};

/**
 * Waiting, drawn as a route being crossed.
 *
 * It replaced three bouncing dots, which were doing their job perfectly well and
 * were the problem: they are the single most recognisable gesture in a messaging
 * interface, and no amount of restraint elsewhere stops a page with them on it
 * reading as a chat window. A mark travelling along a hairline makes the same two
 * promises — something is coming, nothing has stalled — in the one metaphor this
 * product already owns.
 *
 * The label is the part that carries the meaning, which is why it is a required
 * prop rather than a default: "Reading that" and "Pricing the stays" are the
 * difference between a wait that is explained and a spinner.
 */
export function RouteWait({ label }: RouteWaitProps) {
  return (
    <div className="flex items-center gap-4" role="status">
      <span className="label shrink-0 text-ink-muted">{label}</span>
      <span aria-hidden className="route-track max-w-40 flex-1">
        <span className="route-mark" />
      </span>
    </div>
  );
}
