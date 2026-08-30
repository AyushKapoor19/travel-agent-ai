/**
 * The one id tying the definition to whatever references it. Named here rather than
 * written twice, because a filter reference that misses fails silently — the texture
 * simply stops appearing, and nothing says why.
 */
const FILTER_ID = 'glass-specular';

/**
 * The refraction texture, defined once at the document root.
 *
 * Rendered by GradientBackdrop, which is the surface every glass object on the site is
 * ultimately bending. Nothing references it from React any more: the hero's composer
 * used to be a glass pill and is now the same ruled line the conversation uses, and the
 * remaining glass — the closing panel's sphere and its field of tiles — is built in CSS.
 * The definition stays because it is a document-level filter with a stable name, and the
 * next object that wants the texture should reference this rather than declaring a
 * second copy of it.
 */
export function SpecularDefs() {
  return (
    <svg aria-hidden className="pointer-events-none absolute h-0 w-0" focusable="false">
      <defs>
        <filter id={FILTER_ID} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.016"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.2" result="soft" />
          <feSpecularLighting
            in="soft"
            surfaceScale="2.6"
            specularConstant="0.85"
            specularExponent="22"
            lightingColor="#ffffff"
            result="spec"
          >
            <fePointLight x="80" y="-60" z="220" />
          </feSpecularLighting>
        </filter>
      </defs>
    </svg>
  );
}
