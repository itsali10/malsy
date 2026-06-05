import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Malsy — Virtual School',
  description: 'AI-powered online learning platform for young students.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
