'use client';

import { motion } from 'motion/react';

import type { RailField } from '@/components/ui/field-rail';
import { FieldRail } from '@/components/ui/field-rail';
import { PhotoCreditLink } from '@/features/photos/photo-credit-link';
import { PlacePhoto } from '@/features/photos/place-photo';
import { usePlaceImage } from '@/features/photos/use-place-image';
import type { TripBrief } from '@/features/trip/brief';
import { tripNights } from '@/features/trip/brief';
import { tripStub } from '@/features/trip/stub';
import { ease } from '@/lib/design/motion';

/** The document is capped at this width, so the cover never needs more. */
const COVER_SIZES = '(max-width: 768px) 100vw, 768px';

const COVER_FADE_SECONDS = 0.6;

/**
 * The fields printed under the title.
 *
 * The same array the intake was filling in, minus two. The destination is the
 * headline an inch above, and repeating it in a cell is the sort of thing a template
 * does rather than a document. The notes are a sentence — "we must see Fushimi Inari,
 * and no early starts" — and a sentence in a row of ten-character cells is not a
 * field, it is a paragraph that has been cropped; the plan itself is where it shows up.
 *
 * Nights is added rather than folded into the dates, because a cell reading
 * "Apr 1–8 · 7 nights" is two facts in one column heading, and the number of nights is
 * the figure everything downstream was priced against.
 */
function mastheadFields(brief: TripBrief): RailField[] {
  const nights = tripNights(brief);

  return tripStub(brief)
    .filter(
      (field) => field.tone === 'stated' && field.id !== 'destination' && field.id !== 'extras',
    )
    .flatMap<RailField>((field) =>
      field.id === 'dates' && nights !== null
        ? [field, { id: 'nights', label: 'Nights', value: String(nights), tone: 'stated' }]
        : [field],
    );
}

type TripMastheadProps = {
  brief: TripBrief;
};

/**
 * The trip, stated once at the head of its document.
 *
 * What it replaced was a glass panel with the photograph faded out under a title and a
 * line of facts separated by middots. The panel was the problem: the plan below it is
 * a dozen more panels, so the thing that should have read as the cover of a document
 * read as the first of thirteen cards.
 *
 * So the photograph is a plate, the title is set at display size on the page itself,
 * and the facts are the ticket the traveller just filled in — which is the whole
 * argument of this screen in one move. The questions produced a stub; the stub is the
 * masthead of the plan.
 *
 * Nothing is drawn over the photograph, which is the other reason the fade is gone. A
 * Commons photograph of a city is as likely to be a bright sky as a dark facade, and
 * type on top of one needs a scrim that has to be built out of a fixed colour — the one
 * thing in this design system that cannot follow the tone it lands on.
 */
export function TripMasthead({ brief }: TripMastheadProps) {
  const cover = usePlaceImage(brief.destination || null);
  const fields = mastheadFields(brief);

  return (
    <header>
      {cover && (
        <motion.figure
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={ease(COVER_FADE_SECONDS)}
          className="relative mb-8 h-48 w-full overflow-hidden rounded-[var(--radius-glass-sm)] sm:h-72"
        >
          <PlacePhoto
            url={cover.url}
            alt={cover.subject}
            fill
            sizes={COVER_SIZES}
            className="object-cover"
            priority
          />

          {/* The photograph is a plate rather than a backdrop, so the credit is the
              only thing sitting on it and carries its own backing. */}
          <PhotoCreditLink
            image={cover}
            className="absolute bottom-2.5 right-2.5 max-w-[60%] rounded-md bg-black/40 px-1.5 py-0.5 text-[0.5625rem] text-white/70 backdrop-blur-sm hover:text-white"
          />
        </motion.figure>
      )}

      <p className="label text-ink-muted">Itinerary</p>

      <h1 className="display-lg mt-3.5 text-balance text-ink">
        {brief.destination || 'Your trip'}
      </h1>

      {fields.length > 0 && <FieldRail fields={fields} className="tear mt-7 pt-4" />}
    </header>
  );
}
