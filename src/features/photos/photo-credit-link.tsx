import { classNames } from '@/lib/class-names';

import { photoCreditLabel, photoCreditTitle } from './credit';
import type { PlaceImage } from './types';

type PhotoCreditLinkProps = {
  image: PlaceImage;
  /** What the photo stands in for, when that differs from its subject. */
  context?: string;
  /**
   * How much of the attribution is drawn. `credit` is for surfaces too narrow
   * for the subject as well — the full line is always in the tooltip either way,
   * so nothing the licence asks for is lost.
   */
  variant?: 'full' | 'credit';
  className?: string;
};

/**
 * Attribution, linked to the source page.
 *
 * An anchor rather than a caption because the licence asks for the author and a
 * route back to the original, and because it has to be able to sit above a
 * button covering the whole photograph — a link nested inside a button is
 * invalid HTML, so every surface that does this stacks them instead.
 */
export function PhotoCreditLink({
  image,
  context,
  variant = 'full',
  className,
}: PhotoCreditLinkProps) {
  return (
    <a
      href={image.pageUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={photoCreditTitle(image, { context })}
      className={classNames('truncate', className)}
    >
      {variant === 'full' ? photoCreditLabel(image) : image.credit}
    </a>
  );
}
