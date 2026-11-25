import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FocusPulse — Flagsmith Experimentation Demo',
  description: 'Deep work timer comparing minimal distraction-free vs gamified reward experiences.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
