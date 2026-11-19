/**
 * Red Eclipse leaderboard & recent matches API — runs on Vercel (Node serverless).
 * Reads public leaderboard view & recent matches from Supabase PostgREST.
 *
 *   GET /api/leaderboard  ->  { configured, leaderboard: [...], recentMatches: [...] }
 */
export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({
      configured: false,
      leaderboard: [],
      recentMatches: [],
      hint: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel environment variables',
    });
  }

  const base = supabaseUrl.replace(/\/$/, '');
  const headers = {
    apikey: supabaseKey,
    authorization: `Bearer ${supabaseKey}`,
    accept: 'application/json',
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const [lbRes, matchRes] = await Promise.all([
      fetch(`${base}/rest/v1/leaderboard?select=id,name,total_kills,total_deaths,total_score,total_games,total_time_s,kd,last_seen&limit=25`, {
        signal: controller.signal,
        headers,
      }),
      fetch(`${base}/rest/v1/matches?select=id,server_id,map,mode,winner,duration_s,ended_at&order=ended_at.desc&limit=10`, {
        signal: controller.signal,
        headers,
      }),
    ]);

    clearTimeout(timer);

    if (!lbRes.ok || !matchRes.ok) {
      throw new Error(`Supabase REST returned ${lbRes.status}/${matchRes.status}`);
    }

    const [leaderboard, recentMatches] = await Promise.all([lbRes.json(), matchRes.json()]);

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({
      configured: true,
      leaderboard: Array.isArray(leaderboard) ? leaderboard : [],
      recentMatches: Array.isArray(recentMatches) ? recentMatches : [],
    });
  } catch (err) {
    return res.status(200).json({
      configured: true,
      leaderboard: [],
      recentMatches: [],
      error: err.name === 'AbortError' ? 'Supabase query timed out' : String(err.message || err),
    });
  }
}
