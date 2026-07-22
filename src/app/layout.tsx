import './globals.css';
import type { Metadata, Viewport } from 'next';
import SwTools from '@/components/SwTools';
import DevSwUnregister from '@/components/DevSwUnregister';
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: 'Parking Channel',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const isDev = process.env.NODE_ENV === 'development';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
      </head>
      <body>
        {children}
        {isDev ? <DevSwUnregister /> : null}
        {process.env.NEXT_PUBLIC_DEBUG_SITE === '1' ? <SwTools /> : null}
        <Analytics />
      </body>
    </html>
  );
}
