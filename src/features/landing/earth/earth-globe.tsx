'use client';

import { useEffect, useRef } from 'react';

import { classNames } from '@/lib/class-names';

import { MAX_FRAME_SECONDS } from './constants';
import { GlobeScene } from './globe-scene';
import { PointerStir } from './pointer-stir';

type EarthGlobeProps = {
  /** Called once the imagery is on the sphere, so the placeholder can fade out. */
  onReady?: () => void;
  className?: string;
};

/**
 * The planet.
 *
 * All this component does is own the lifetime: build the scene, keep it sized,
 * run a frame loop while it is on screen, and hand the GPU its memory back. The
 * rendering is `GlobeScene` and the feel of a stir is `PointerStir`; neither
 * knows React exists, which is what keeps this readable — a scene graph, a
 * physics model and a component lifecycle are three different things to be wrong
 * about, and they were previously wrong about each other in one effect.
 *
 * Nothing here is state. A re-render would rebuild a renderer and four textures,
 * so every moving part is a local in the effect or a field on one of the two
 * objects it creates.
 */
export function EarthGlobe({ onReady, className }: EarthGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = GlobeScene.create(canvas);
    if (!scene) return;

    const stir = new PointerStir();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let handle = 0;
    let running = false;
    let last = 0;

    const loop = (now: number) => {
      // Cleared first, so a visibility flip mid-frame cannot leave two loops
      // running against each other.
      handle = 0;

      const elapsed = last === 0 ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
      last = now;

      stir.decay(elapsed);
      scene.advance(elapsed, stir.boost);
      scene.render();

      if (running) handle = requestAnimationFrame(loop);
    };

    const start = () => {
      // Nothing turns, so one frame is the whole animation.
      if (reducedMotion.matches) {
        scene.render();
        return;
      }

      running = true;
      last = 0;
      if (handle === 0) handle = requestAnimationFrame(loop);
    };

    const stop = () => {
      running = false;
      if (handle !== 0) cancelAnimationFrame(handle);
      handle = 0;
      stir.reset();
    };

    /**
     * The stage is `pointer-events-none` — the planet must never stand between a
     * reader and the field they came here to type in — so the cursor is followed
     * on the window and tested against the disc by hand rather than by hit
     * testing. Ignored unless the loop is running, which rules out the off-screen
     * case, the pre-measure case and the reduced-motion case at once.
     */
    const onPointerMove = (event: PointerEvent) => {
      if (!running) return;
      stir.sample(event, canvas.getBoundingClientRect(), scene.diameter);
    };

    const visibility = new IntersectionObserver(
      (entries) => {
        // Any entry is this canvas; `some` avoids indexing an array the DOM
        // types do not promise is non-empty.
        if (entries.some((entry) => entry.isIntersecting)) start();
        else stop();
      },
      { threshold: 0 },
    );

    // Under reduced motion there is no loop to pick the new size up.
    const resize = new ResizeObserver(() => {
      scene.measure();
      if (reducedMotion.matches) scene.render();
    });

    let cancelled = false;

    scene
      .loadTextures()
      .then(() => {
        if (cancelled) return;

        scene.measure();
        resize.observe(canvas);
        visibility.observe(canvas);
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        start();
        onReady?.();
      })
      .catch(() => {
        // A missing texture leaves the caller's placeholder planet in place.
      });

    return () => {
      cancelled = true;
      stop();
      resize.disconnect();
      visibility.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      scene.dispose();
    };
  }, [onReady]);

  // `h-full w-full` is load-bearing: a canvas is a replaced element, so `inset-0`
  // on its own leaves it at its intrinsic 300×150 rather than stretching it, and
  // the scene reads its client box to size the sphere.
  return <canvas ref={canvasRef} className={classNames('h-full w-full', className)} />;
}
