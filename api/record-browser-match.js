/**
 * Records a completed browser arena match into Supabase (players, matches, match_players).
 * Validates bounds server-side and forwards via record-match Edge Function or service_role RPC.
 */
const ALLOWED_MAPS = new Set(['rift', 'processing', 'ares']);
const ALLOWED_MODES = new Set(['dm', 'tdm', 'instagib', 'trial']);

function cleanStr(val, maxLen, fallback) {
  const s = String(val ?? '').trim();
  if (!s) return fallback;
  return s.slice(0, maxLen);
}

function clampInt(val, min, max) {
  const n = Math.trunc(Number(val));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Missing request body' });
  }

  const map = ALLOWED_MAPS.has(body.map) ? body.map : null;
  const mode = ALLOWED_MODES.has(body.mode) ? body.mode : null;
  const durationS = clampInt(body.duration_s, 0, 3600);
  if (!map || !mode || durationS < 10 || !Array.isArray(body.players) || body.players.length === 0) {
    return res.status(400).json({ error: 'Invalid match summary payload' });
  }

  const players = body.players.slice(0, 16).map((p, idx) => {
    const rawKey = cleanStr(p?.auth_key, 64, `anon_${idx}`);
    const safeKey = rawKey.replace(/[^a-zA-Z0-9_:-]/g, '_');
    return {
      auth_key: safeKey,
      name: cleanStr(p?.name, 24, `Player${idx + 1}`),
      team: p?.team ? cleanStr(p.team, 16, null) : undefined,
      kills: clampInt(p?.kills, 0, 250),
      deaths: clampInt(p?.deaths, 0, 250),
      score: clampInt(p?.score, -100, 10000),
    };
  });

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - durationS * 1000);
  const rawServer = cleanStr(body.server_id, 32, 'web-browser').replace(/[^a-zA-Z0-9_-]/g, '');
  const serverId = rawServer.startsWith('web-') ? rawServer : `web-${rawServer}`;
  const winner = body.winner ? cleanStr(body.winner, 24, null) : null;

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const serverToken = process.env.GAME_SERVER_TOKEN || '';

  if (!supabaseUrl) {
    return res.status(500).json({ error: 'SUPABASE_URL not configured' });
  }

  try {
    // Prefer the Edge Function when GAME_SERVER_TOKEN is configured
    if (serverToken) {
      const fnRes = await fetch(`${supabaseUrl}/functions/v1/record-match`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-server-token': serverToken,
        },
        body: JSON.stringify({
          server_id: serverId,
          map,
          mode,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          winner,
          players,
        }),
      });
      if (fnRes.ok) {
        const out = await fnRes.json();
        return res.status(200).json({ ok: true, match_id: out.match_id ?? null, via: 'edge-function' });
      }
      if (fnRes.status !== 401 || !serviceKey) {
        const text = await fnRes.text();
        return res.status(fnRes.status).json({ error: `Edge function error: ${text}` });
      }
    }

    if (!serviceKey) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
    }

    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/record_match`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        p_server_id: serverId,
        p_map: map,
        p_mode: mode,
        p_started: startedAt.toISOString(),
        p_ended: endedAt.toISOString(),
        p_winner: winner,
        p_players: players,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      return res.status(500).json({ error: `Supabase RPC failed: ${errText}` });
    }

    const matchId = await rpcRes.json();
    return res.status(200).json({ ok: true, match_id: matchId, via: 'rpc' });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
