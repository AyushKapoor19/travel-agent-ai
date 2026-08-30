import { PhotoCreditLink } from '@/features/photos/photo-credit-link';
import { PlacePhoto } from '@/features/photos/place-photo';
import type { PlaceImage } from '@/features/photos/shared';
import { gradientCss } from '@/lib/design/gradient';

/** Sizes for the result grid: full width on a phone, half on a tablet, a third above. */
const PLATE_SIZES = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px';

/** A sheen on the placeholder, so a result with no photo is not a flat swatch. */
const PLACEHOLDER_SHEEN =
  'radial-gradient(ellipse at 26% 18%, rgb(255 255 255 / 0.22) 0%, transparent 58%)';

type PlateProps = {
  /** Seeds the fallback gradient. The result id, so it is stable per result. */
  seed: string;
  /**
   * What the result is, drawn only when there is no photograph.
   *
   * Over a photo it was noise — a tracked "HOTEL" burnt into the corner of every
   * plate in the grid — and the property type reads better in the meta line beneath.
   * With no photo the plate is otherwise a blank swatch of colour, and one word is
   * the difference between a placeholder and a mistake.
   */
  fallbackLabel: string;
  image: PlaceImage | null;
  /**
   * What the photo actually shows, when that is not the result's subject. For a
   * stay that is the neighbourhood, not the property — the mock listings have no
   * real building behind them, and implying otherwise would be the same failure
   * as inventing a price.
   */
  caption?: string;
};

/**
 * A result's photograph, on a gradient it can fall back to.
 *
 * The plate, which is the only object left in the document: a photograph with a
 * radius and nothing else — no rim, no shadow, no panel behind it, and no tracked
 * label burnt into the corner. It used to be the lid of a glass card, and the card
 * was doing the announcing; here the photograph is the whole of it, and the type
 * sits on the page beneath rather than inside a container with it.
 *
 * The gradient is the base layer rather than a swap, so a missing or slow photo
 * degrades to a coloured plate instead of a broken image box.
 */
export function Plate({ seed, fallbackLabel, image, caption }: PlateProps) {
  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-glass-sm)]"
      style={{ background: gradientCss(seed) }}
    >
      {image ? (
        <PlacePhoto
          url={image.url}
          alt={caption ? `${caption}: ${image.subject}` : image.subject}
          fill
          sizes={PLATE_SIZES}
          className="object-cover"
        />
      ) : (
        <>
          <div aria-hidden className="absolute inset-0" style={{ background: PLACEHOLDER_SHEEN }} />
          <span className="label absolute bottom-3 left-3 text-ink-soft/70">{fallbackLabel}</span>
        </>
      )}

      {/* Only drawn under the attribution the licence asks for, and only over a
          photograph. Shallower than the old label scrim, which covered two thirds
          of every result and was the reason they all read as the same object. */}
      {image && (
        <>
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent"
          />

          {caption && (
            <span className="absolute bottom-1.5 left-2.5 text-[0.625rem] font-medium text-white/80">
              {caption}
            </span>
          )}

          <PhotoCreditLink
            image={image}
            context={caption}
            variant="credit"
            className="absolute bottom-1.5 right-2.5 max-w-[55%] text-[0.5625rem] text-white/55 hover:text-white/85"
          />
        </>
      )}
    </div>
  );
}
