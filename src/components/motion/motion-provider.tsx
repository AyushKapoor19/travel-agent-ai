'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * The CSS animations honour prefers-reduced-motion through a media query, but
 * the spring animations run in JavaScript and need to be told.
 */
type MotionProviderProps = {
  children: ReactNode;
};

export function MotionProvider({ children }: MotionProviderProps) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
