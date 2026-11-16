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
    .from('rooms')
    .select('id, code, name, host_id, track_id, laps, max_players, ai_fill, status, created_at, updated_at, room_players(id, nickname, kart_id, seat_index, is_host, is_ready)')
    .in('status', ['waiting', 'countdown', 'racing'])
    .order('updated_at', { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rooms: rooms ?? [] });
}
