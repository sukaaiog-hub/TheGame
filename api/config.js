/**
 * Public runtime config for browser Supabase Realtime multiplayer.
 * Exposes only public URL + anon key (never service role key or server tokens).
 */
export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey,
    realtimeEnabled: Boolean(supabaseUrl && supabaseAnonKey),
  });
}
