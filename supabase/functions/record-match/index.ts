// Supabase Edge Function — records a finished match.
// Deploy:  supabase functions deploy record-match
// Secret:  supabase secrets set GAME_SERVER_TOKEN=<random-string>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PlayerResult {
  auth_key: string;
  name: string;
  team?: string;
  kills?: number;
  deaths?: number;
  score?: number;
}

interface MatchPayload {
  server_id: string;
  map: string;
  mode: string;
  started_at: string;
  ended_at: string;
  winner?: string;
  players: PlayerResult[];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const token = req.headers.get('x-server-token');
  const expected = Deno.env.get('GAME_SERVER_TOKEN');
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: MatchPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!body?.server_id || !body?.map || !body?.mode || !body?.started_at || !body?.ended_at || !Array.isArray(body?.players)) {
    return new Response(JSON.stringify({ error: 'missing fields' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase.rpc('record_match', {
    p_server_id: body.server_id,
    p_map: body.map,
    p_mode: body.mode,
    p_started: body.started_at,
    p_ended: body.ended_at,
    p_winner: body.winner ?? null,
    p_players: body.players,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, match_id: data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
