import type { Metadata } from 'next';
import { Nunito, Quicksand } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import ClientShell from '../components/ClientShell';

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '500', '600', '700'],
});

const quicksand = Quicksand({
  subsets: ['latin'],
  variable: '--font-quicksand',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'MALSY — Student Platform',
  description: 'Your AI-powered learning platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${quicksand.variable}`}>
      <body>
        <Script id="malsy-theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('malsy_theme')||'light';document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`}
        </Script>
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
