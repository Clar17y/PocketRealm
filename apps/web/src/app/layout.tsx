import type { Metadata, Viewport } from 'next';
import { Almendra, Crimson_Text, Silkscreen } from 'next/font/google';
import PlausibleProvider from 'next-plausible';
import './globals.css';

const almendra = Almendra({ weight: ['400', '700'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-almendra', display: 'swap' });
const crimsonText = Crimson_Text({ weight: ['400', '600', '700'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-crimson', display: 'swap' });
const silkscreen = Silkscreen({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-pixel', display: 'swap' });

export const metadata: Metadata = {
  title: 'PocketRealm — Turn-Based Async RPG',
  description: 'A turn-based RPG that respects your time. Explore 11 zones, battle 80+ monsters, master 14 crafting skills, and support PocketRealm with optional Champion time.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PocketRealm',
  },
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
      <body className={`${almendra.variable} ${crimsonText.variable} ${silkscreen.variable}`}>
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ? (
          <PlausibleProvider domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}>
            {children}
          </PlausibleProvider>
        ) : children}
      </body>
    </html>
  );
}
