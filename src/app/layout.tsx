import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TuxKart Rush — 3D Multiplayer Kart Racing',
  description:
    'SuperTuxKart-inspired 3D WebGL multiplayer arcade kart racer for 3-4 players, powered by Three.js, Supabase Realtime, and Vercel.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#060913] text-slate-100 antialiased selection:bg-cyan-400/30">
        {children}
      </body>
    </html>
  );
}
