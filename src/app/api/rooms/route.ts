import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase environment variables are not configured' },
      { status: 503 }
    );
  }

  const { data: rooms, error } = await supabase
    .from('br_rooms')
    .select(
      'id, code, name, host_id, map_id, mode, max_players, bot_count, match_seed, status, created_at, updated_at, br_players(id, nickname, operator_id, seat_index, team_index, is_host, is_ready)'
    )
    .in('status', ['waiting', 'countdown', 'active'])
    .order('updated_at', { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rooms: rooms ?? [] });
}
