import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DROPZONE ROYALE — Top-Down Multiplayer Battle Royale',
  description:
    'Tactical 2D top-down Battle Royale shooter for 3–4 players with procedural terrain, loot crates, orbital airdrops, shrinking storm zone, and Supabase Realtime multiplayer.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#060913] text-slate-100 antialiased selection:bg-amber-400/30">
        {children}
      </body>
    </html>
  );
}
