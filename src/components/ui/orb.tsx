import { cn } from '@/lib/cn';

type OrbProps = {
  /** Rendered size in pixels. */
  size?: number;
  className?: string;
  /** Tightens the pulse while the agent is working. */
  active?: boolean;
};

const DEFAULT_SIZE_PX = 96;

/** Breathing rate. Faster while the agent is working, which is the only tell it gives. */
const PULSE_IDLE = '5.5s';
const PULSE_ACTIVE = '2.4s';

/**
 * The five layers of the sphere, in the order they stack.
 *
 * Written as constants because every one of them is a gradient string, and a
 * gradient inlined in JSX is the kind of thing that gets tweaked in one place and
 * not the other — the halo and the bounce both read `--orb-lit`, and the sphere
 * stops being lit from one direction the moment they disagree.
 */
const Layer = {
  HALO: 'radial-gradient(circle at 50% 50%, var(--orb-glow) 0%, transparent 70%)',
  BODY: 'radial-gradient(circle at 30% 24%, var(--orb-lit) 0%, var(--orb-mid) 42%, var(--orb-shadow) 100%)',
  /** Reads as thickness: a dark rim at the bottom right, a lit one at the top left. */
  BODY_SHADOW: 'inset -3px -5px 12px rgb(0 0 0 / 0.45), inset 2px 3px 8px rgb(255 255 255 / 0.22)',
  /** The single detail that turns a circle into a sphere. */
  HOTSPOT: 'radial-gradient(ellipse at center, rgb(255 255 255 / 0.95) 0%, transparent 70%)',
  /** Light bouncing back up off the surface the sphere is resting on. */
  BOUNCE: 'radial-gradient(ellipse at center, var(--orb-lit) 0%, transparent 74%)',
} as const;

const BOUNCE_OPACITY = 0.4;

/**
 * The agent's identity: one sphere, lit from the upper left, and nothing else.
 *
 * It is deliberately monochrome. A coloured bot avatar would be the only hue on
 * a page whose whole argument is that restraint reads as competence, and the
 * sphere's tones come from the tone tokens, so the same component is obsidian
 * on paper and moonstone on night without a prop.
 */
export function Orb({ size = DEFAULT_SIZE_PX, className, active = false }: OrbProps) {
  const animationDuration = active ? PULSE_ACTIVE : PULSE_IDLE;

  return (
    <div
      aria-hidden
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <div
        className="animate-orb-halo absolute inset-0 rounded-full blur-lg"
        style={{ background: Layer.HALO, animationDuration }}
      />

      <div
        className="animate-orb-pulse absolute inset-[10%] overflow-hidden rounded-full"
        style={{ background: Layer.BODY, boxShadow: Layer.BODY_SHADOW, animationDuration }}
      >
        <div
          className="absolute left-[16%] top-[11%] h-[28%] w-[34%] rounded-full blur-[4px]"
          style={{ background: Layer.HOTSPOT }}
        />
        <div
          className="absolute bottom-[9%] left-[26%] h-[15%] w-[46%] rounded-full blur-[7px]"
          style={{ background: Layer.BOUNCE, opacity: BOUNCE_OPACITY }}
        />
      </div>
    </div>
  );
}
