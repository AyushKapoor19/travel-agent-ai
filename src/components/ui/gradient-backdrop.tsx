import { SpecularDefs } from './specular';

/**
 * The page's base coat, behind everything and visible wherever a section does
 * not paint its own surface — which in practice means the chat.
 *
 * Three large blurred washes drifting on long, offset cycles. They are near
 * neutral on purpose: a panel is nearly white itself, so it needs *something*
 * underneath to refract, but anything with real chroma would put a second
 * colour on a page whose only accent is a single yellow mark.
 */
export function GradientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 surface-paper" />

      <div
        className="backdrop-blob animate-drift-a left-[-12%] top-[-18%] h-[62vh] w-[58vw] bg-[#e4e9ec] opacity-70"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="backdrop-blob animate-drift-b right-[-16%] top-[8%] h-[56vh] w-[52vw] bg-[#efe9dc] opacity-70"
        style={{ animationDelay: '-8s' }}
      />
      <div
        className="backdrop-blob animate-drift-c bottom-[-22%] left-[12%] h-[56vh] w-[56vw] bg-[#f5efd6] opacity-45"
        style={{ animationDelay: '-16s' }}
      />

      {/* Washes the top and bottom back towards paper so text on glass stays
          legible wherever a blob drifts. */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/75 via-white/25 to-white/85" />

      <SpecularDefs />
    </div>
  );
}
