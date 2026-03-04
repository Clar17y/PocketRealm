import type { Metadata, Viewport } from 'next';
import { Almendra, Silkscreen, Nunito } from 'next/font/google';
import './globals.css';

const almendra = Almendra({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-display' });
const silkscreen = Silkscreen({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-pixel' });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'Adventure RPG — Turn-Based Async RPG',
  description: 'A turn-based RPG that respects your time. Explore 11 zones, battle 80+ monsters, master 14 crafting skills, and raid world bosses. Play free or go Champion.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0c0a08',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${almendra.variable} ${silkscreen.variable} ${nunito.variable} font-body`}>{children}</body>
    </html>
  );
}
