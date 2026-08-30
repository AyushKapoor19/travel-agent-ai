import { BackSide, Color, ShaderMaterial } from 'three';

import type { AtmosphereShell } from './constants';

/**
 * Atmosphere. A shell rendered from the inside, so the planet itself occludes
 * everything but the ring of air around its limb.
 *
 * The falloff is normalised against the shell's own silhouette: on a back face
 * the view dot runs from 0 exactly at the shell's outer edge to `-limit` where
 * the planet cuts in front of it. Dividing by `limit` puts full strength at the
 * planet's limb and precisely zero at the outer edge — which is the whole
 * point, because any glow left over out there draws a hard ring on the page.
 *
 * Alpha-blended rather than additive: the page is white, and adding light to
 * white produces nothing at all.
 */
export function atmosphereMaterial({
  scale,
  color,
  power,
  strength,
}: AtmosphereShell): ShaderMaterial {
  const limit = Math.sqrt(1 - 1 / (scale * scale));

  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uPower: { value: power },
      uStrength: { value: strength },
      uLimit: { value: limit },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uStrength;
      uniform float uLimit;
      varying vec3 vNormal;

      void main() {
        float depth = clamp(-dot(vNormal, vec3(0.0, 0.0, 1.0)) / uLimit, 0.0, 1.0);
        gl_FragColor = vec4(uColor, pow(depth, uPower) * uStrength);
      }
    `,
    side: BackSide,
    transparent: true,
    depthWrite: false,
  });
}
