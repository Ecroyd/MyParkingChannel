import './globals.css';
import type { Metadata } from 'next';
import SwTools from '@/components/SwTools';
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: 'Parking Channel',
};

const isDev = process.env.NODE_ENV === 'development';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
      </head>
      <body>
        {children}
        {process.env.NEXT_PUBLIC_DEBUG_SITE === '1' ? <SwTools /> : null}
        <Analytics />
      </body>
    </html>
  );
}
