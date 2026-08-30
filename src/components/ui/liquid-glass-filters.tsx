/**
 * The displacement filter that warps whatever is behind the button.
 *
 * A blur alone gives frosted glass — a surface you cannot see through. Pushing
 * the backdrop around with fractal noise first gives *refraction*, which is the
 * difference between a pane and a lens, and the only reason the sphere in the
 * closing section reads as something with thickness.
 *
 * Referenced from `backdrop-filter: url(…)`, which only Chromium honours.
 * Safari and Firefox fall through to the plain blur declared alongside it.
 *
 * There was a second, gentler filter here for the flag tiles. It came out: at
 * the size a tile renders, the displacement was a texture you had to go looking
 * for, and twenty noise chains filtering a backdrop made mostly of other tiles
 * was the bulk of what made the section stutter on arrival.
 */
export function LiquidGlassFilters() {
  return (
    <svg aria-hidden focusable="false" className="pointer-events-none absolute h-0 w-0">
      <defs>
        <filter
          id="liquidGlass"
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.011"
            numOctaves={2}
            seed={42}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation={1.6} result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale={68}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
