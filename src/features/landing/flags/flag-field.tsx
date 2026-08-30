'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { motion } from 'motion/react';

import { FLAGS } from './flags';
import type { FlagTile } from './placement';
import { placeFlags } from './placement';

/**
 * The entrance: a beat to let the panel settle, then one tile after another.
 *
 * The easing overshoots nothing and decelerates hard, so twenty tiles arriving
 * over two seconds read as being dealt out rather than as a queue clearing.
 */
const FAN_DURATION_SECONDS = 1;
const FAN_LEAD_SECONDS = 0.8;
const FAN_STEP_SECONDS = 0.08;
const FAN_EASE: [number, number, number, number] = [0.5, 0, 0, 1];

/**
 * Where a tile starts, as a fraction of the field: the horizontal middle, and
 * just past the bottom edge so it is off the screen whatever size it is there.
 */
const FROM_CENTER = 0.5;
const FROM_BELOW = 1.05;

type FlagFieldProps = {
  /** The button is hovered, which opens the fan wider. Driven in CSS. */
  spread: boolean;
  /** This panel is the one being travelled to, which replays the entrance. */
  showing: boolean;
};

/**
 * The tiles that drift behind the closing panel.
 *
 * They arrive from under the middle of the screen and fan out into place. Doing
 * that by tweening `left` and `top` would lay every one of them out on every
 * frame; this measures the field once and expresses the same path as a transform
 * offset, so the entrance is composited and the tiles cannot stutter on a phone.
 *
 * The entrance is replayed on every arrival, not just the first. Leaving the
 * panel does nothing at all: the fan is put back the moment the reader starts
 * travelling towards it, while the panel is still a screen away, so the reset
 * costs a frame nobody is looking at and the entrance is the only part anyone
 * ever sees.
 */
export function FlagField({ spread, showing }: FlagFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const tiles = useMemo(() => placeFlags(FLAGS), []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    // Measured on mount and on resize rather than observed. The field changes
    // size whenever the button is hovered, and a ResizeObserver would re-render
    // every tile on every frame of that transition to recompute a starting
    // offset none of them will ever read again.
    const measure = () => setBox({ width: field.offsetWidth, height: field.offsetHeight });

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /**
   * Gathered, then fanned — two renders rather than one, because a tile can only
   * travel from somewhere it already is. The first puts the run back in the
   * middle with a zero-length transition, and the frame after it releases them;
   * nothing is batched away in between, since the two updates are in different
   * tasks.
   *
   * Waiting on the measurement matters as much as waiting on `showing`. Until the
   * field has a size no tile is rendered at all, and a run that opened before
   * that would be asking elements which do not exist yet to move — so the first
   * thing they would do on appearing is sit at the far end of it.
   */
  const [fanned, setFanned] = useState(false);

  // Whether the field has been measured, not what it measured: a window being
  // dragged changes the width on every frame, and the run is not an answer to
  // any of them.
  const measured = box.width > 0;

  useEffect(() => {
    if (!showing || !measured) return;

    setFanned(false);
    const frame = requestAnimationFrame(() => setFanned(true));
    return () => cancelAnimationFrame(frame);
  }, [showing, measured]);

  return (
    <div ref={fieldRef} aria-hidden className="ready-field" data-spread={spread ? '' : undefined}>
      {/* Nothing until the field has a size, or every tile's start and end would
          be recorded as the same point and none of them would travel. */}
      {measured &&
        tiles.map((tile, index) => (
          <FlagTileView
            key={tile.code}
            tile={tile}
            index={index}
            fanned={fanned}
            from={{
              x: box.width * (FROM_CENTER - tile.left / 100),
              y: box.height * (FROM_BELOW - tile.top / 100),
            }}
          />
        ))}
    </div>
  );
}

type FlagTileViewProps = {
  tile: FlagTile;
  /** Position in the run, which sets the tile's turn in the deal. */
  index: number;
  fanned: boolean;
  /** Offset, in pixels, from where the tile belongs to where it comes in from. */
  from: { x: number; y: number };
};

function FlagTileView({ tile, index, fanned, from }: FlagTileViewProps) {
  return (
    <div
      className="absolute"
      style={{
        left: `${tile.left}%`,
        top: `${tile.top}%`,
        translate: '-50% -50%',
        zIndex: tile.depth,
      }}
    >
      {/* `initial={false}` so the target is re-read on every render rather than
          snapshotted at mount: the tiles are laid out from a measurement, and the
          measurement lands after the first paint. */}
      <motion.div
        initial={false}
        animate={fanned ? { x: 0, y: 0, rotate: tile.rotate } : { x: from.x, y: from.y, rotate: 0 }}
        // The gather is a cut, not a move. It happens as the reader starts
        // travelling here, with the panel still a screen away.
        transition={
          fanned
            ? {
                duration: FAN_DURATION_SECONDS,
                delay: FAN_LEAD_SECONDS + index * FAN_STEP_SECONDS,
                ease: FAN_EASE,
              }
            : { duration: 0 }
        }
        className="ready-tile"
        style={{ backgroundColor: `${tile.tint}24`, borderColor: `${tile.tint}40` }}
      >
        <div className="ready-tile__glass" />
        {/* eslint-disable-next-line @next/next/no-img-element -- a 400-byte local
            SVG gives the image optimiser nothing to do, and next/image will not
            serve one without dangerouslyAllowSVG. Eager, because all twenty
            together are ten kilobytes and lazy ones would decode mid-flight. */}
        <img
          src={`/flags/${tile.code}.svg`}
          alt=""
          decoding="async"
          className="relative z-[2] w-full rounded-[3px] shadow-[0_3px_10px_rgb(0_0_0/0.45)]"
        />
      </motion.div>
    </div>
  );
}
