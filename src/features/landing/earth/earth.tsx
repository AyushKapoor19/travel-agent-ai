'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';

import { motion, useScroll, useTransform } from 'motion/react';

import { BLOOM, DISC_OF_STAGE, MAX_DIAMETER_PX } from './constants';

/**
 * Loaded on the client only, and after the page is interactive: three.js and two
 * megabytes of NASA imagery must never sit between a visitor and the sentence
 * they came here to type.
 */
const EarthGlobe = dynamic(() => import('./earth-globe').then((module) => module.EarthGlobe), {
  ssr: false,
});

/** The height of the band the planet occupies. `--cap` carries it into the disc's size. */
const STAGE = 'h-[34vh] [--cap:34vh] sm:h-[42vh] sm:[--cap:42vh]';

/**
 * The placeholder's diameter, from the globe's own framing rules rather than from
 * numbers typed twice — so the crossfade holds still instead of resizing under
 * itself. Mirrors `GlobeScene.measure`: the stage's height, the width that keeps
 * the bloom on screen, and the hard cap.
 */
const DISC_DIAMETER = [
  `calc(var(--cap) * ${DISC_OF_STAGE})`,
  `calc(100vw / ${BLOOM.scale})`,
  `${MAX_DIAMETER_PX}px`,
].join(', ');

/**
 * Ocean and atmosphere only. Anything more would be a worse guess than nothing.
 *
 * The terminator runs down the right-hand limb to match where the real globe's
 * sun sits, so the swap from placeholder to sphere does not also swing the
 * lighting across the frame.
 */
const PLACEHOLDER =
  'radial-gradient(115% 115% at 33% 12%, #86dcef 0%, #2ea7c8 34%, #14708f 62%, #06283b 100%)';

const PLACEHOLDER_GLOW = [
  '0 0 0 1px rgb(196 233 251 / 0.45)',
  '0 0 34px 4px rgb(120 190 230 / 0.38)',
  '0 0 90px 26px rgb(110 175 220 / 0.2)',
].join(', ');

/** How far the planet sinks as the page rises, and over what scroll distance. */
const SINK_OVER_PX = 800;
const SINK_PX = 22;

export function Earth() {
  const { scrollY } = useScroll();

  // Sinks as the page rises, but only as far as the clearance under the disc:
  // any further and the hero's own overflow would clip the planet, which is the
  // hard edge this framing exists to avoid.
  const y = useTransform(scrollY, [0, SINK_OVER_PX], [0, SINK_PX]);

  const [ready, setReady] = useState(false);

  // Stable, so mounting the globe does not restart its effect.
  const handleReady = useCallback(() => setReady(true), []);

  return (
    <motion.div
      aria-hidden
      style={{ y }}
      className={`globe-stage pointer-events-none absolute inset-x-0 bottom-0 ${STAGE}`}
    >
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-700"
        style={{
          width: `min(${DISC_DIAMETER})`,
          height: `min(${DISC_DIAMETER})`,
          background: PLACEHOLDER,
          boxShadow: PLACEHOLDER_GLOW,
          opacity: ready ? 0 : 1,
        }}
      />

      <EarthGlobe
        onReady={handleReady}
        className={`absolute inset-0 transition-opacity duration-1000 ${
          ready ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </motion.div>
  );
}
