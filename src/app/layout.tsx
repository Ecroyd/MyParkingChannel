import './globals.css';
import type { Metadata } from 'next';
import SwTools from '@/components/SwTools';

export const metadata: Metadata = {
  title: 'Parking Channel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NEXT_PUBLIC_DEBUG_SITE === '1' ? <SwTools /> : null}
      </body>
    </html>
  );
}
