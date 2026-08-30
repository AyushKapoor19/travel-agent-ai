/**
 * The answer that was not accepted, said plainly under the line it was typed on.
 *
 * Borrows the red rule from `ChatError` because it is the same claim — this did
 * not work — and the codebase has exactly one way of making it. What it does not
 * borrow is the Retry button, and the omission is the point: retrying a failed
 * turn sends the same message again, which is the one thing guaranteed not to
 * help here. The way out is the answer field directly above, which already has
 * their words in it waiting to be changed, so there is nothing for a button to
 * do that the caret is not already doing.
 */
type AnswerRejectedProps = {
  /** Phrased by the server and shown verbatim, as with a failed turn. */
  message: string;
};

export function AnswerRejected({ message }: AnswerRejectedProps) {
  return (
    <p
      role="alert"
      className="border-l-2 border-red-500/50 pl-3.5 text-[0.8125rem] leading-relaxed text-red-700"
    >
      {message}
    </p>
  );
}
