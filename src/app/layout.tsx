import { DM_Mono, DM_Sans } from 'next/font/google';

import type { Metadata } from 'next';

import { MotionProvider } from '@/components/motion/motion-provider';
import { GradientBackdrop } from '@/components/ui/gradient-backdrop';

import '@/styles/globals.css';

/**
 * One grotesque and one mono, and nothing else. DM Sans carries everything the
 * reader is meant to read — the display sizes without the wide sidebearings
 * that make most UI faces fall apart above 4rem, the body copy, and the tiny
 * tracked-out labels, so a caption and the sentence it annotates are the same
 * voice at two sizes. DM Mono is held back for code in an agent's reply, where
 * a fixed advance is the point.
 */
const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  display: 'swap',
});

const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Wayfare — AI Travel Agent',
  description:
    'Plan a trip in one conversation. Wayfare asks a few questions, then builds a day-by-day itinerary with real places to stay.',
  openGraph: {
    title: 'Wayfare — AI Travel Agent',
    description:
      'Plan a trip in one conversation. A day-by-day itinerary with real places to stay, priced and ready to book.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmMono.variable} antialiased`}>
        <GradientBackdrop />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
