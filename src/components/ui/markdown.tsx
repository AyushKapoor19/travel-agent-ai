'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * The three sizes the agent's prose is ever set at.
 *
 * A closed set held here rather than a `className` passed in, for the reason the
 * springs are a closed set: the wrapper carries a Tailwind size utility, and a
 * utility beats the component layer — so a caller trying to restyle the prose
 * from outside would silently lose to the default it was trying to replace.
 */
const VARIANT = {
  /** Body copy: a day of the plan, an answer to a follow-up. */
  body: 'agent-prose text-[0.9375rem] leading-relaxed text-ink-soft',
  /** The question being asked, which holds the middle of the intake screen. */
  ask: 'agent-prose ask-prose display-ask',
  /** The paragraph that opens the finished plan. */
  lede: 'agent-prose lede text-ink-soft',
} as const;

type MarkdownProps = {
  /** The agent's prose. Frequently a partial document: this renders mid-stream. */
  content: string;
  variant?: keyof typeof VARIANT;
};

export function Markdown({ content, variant = 'body' }: MarkdownProps) {
  return (
    <div className={VARIANT[variant]}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
