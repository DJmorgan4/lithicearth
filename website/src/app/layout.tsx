 
 
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'LithicEarth — Ancient Sites Archive',
  description: "A living archive of Earth's ancient landscapes. Document and explore archaeological sites, environmental anomalies, and geological formations worldwide.",
  openGraph: {
    title: 'LithicEarth',
    description: "A living archive of Earth's ancient landscapes.",
    siteName: 'LithicEarth',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-black">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-[#e8e4d9]`}
      >
        {children}
      </body>
    </html>
  );
}
