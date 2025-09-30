import './globals.css';
import type { Metadata } from 'next';
import SwTools from '@/components/SwTools';

export const metadata: Metadata = {
  title: 'Parking Channel',
};

const isDev = process.env.NODE_ENV === 'development';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {isDev && (
          <meta
            httpEquiv="Content-Security-Policy"
            content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline';"
          />
        )}
      </head>
      <body>
        {children}
        {process.env.NEXT_PUBLIC_DEBUG_SITE === '1' ? <SwTools /> : null}
      </body>
    </html>
  );
}
