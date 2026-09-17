import type { Metadata, Viewport } from 'next';
import './globals.css';
import './standard-attendance.css';
import './print.css';
import { isDemoMode } from '@/lib/demo-mode';

export const metadata: Metadata = {
  title: 'BSmile CRM',
  description: 'BSmile internal portal',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: { url:'/images/bsmile-mark.png', type: 'image/png' },
    apple: '/images/bsmile-mark.png',
  },
  ...(isDemoMode() ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = { themeColor: '#0f766e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
