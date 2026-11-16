import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase environment variables are not configured' },
      { status: 503 }
    );
  }

  const trackId = request.nextUrl.searchParams.get('trackId');
  let query = supabase
    .from('race_results')
    .select('id, track_id, player_id, nickname, kart_id, finish_position, total_time_ms, best_lap_ms, created_at')
    .eq('is_ai', false)
    .order('total_time_ms', { ascending: true })
    .limit(20);

  if (trackId && ['lighthouse_bay', 'frozen_tundra', 'magma_caldera'].includes(trackId)) {
    query = query.eq('track_id', trackId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase environment variables are not configured' },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as {
      roomId?: string;
      trackId?: string;
      playerId?: string;
      nickname?: string;
      kartId?: string;
      isAi?: boolean;
      finishPosition?: number;
      totalTimeMs?: number;
      bestLapMs?: number | null;
    };

    if (!body.trackId || !body.playerId || !body.nickname || !body.kartId || !body.finishPosition || !body.totalTimeMs) {
      return NextResponse.json({ error: 'Missing required race result fields' }, { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeRoomId = body.roomId && uuidRegex.test(body.roomId) ? body.roomId : null;

    const { error } = await supabase.from('race_results').upsert(
      {
        room_id: safeRoomId,
        track_id: body.trackId,
        player_id: body.playerId.slice(0, 64),
        nickname: body.nickname.slice(0, 20),
        kart_id: body.kartId,
        is_ai: Boolean(body.isAi),
        finish_position: Math.max(1, Math.min(4, Math.round(body.finishPosition))),
        total_time_ms: Math.max(1000, Math.round(body.totalTimeMs)),
        best_lap_ms: body.bestLapMs ? Math.max(1000, Math.round(body.bestLapMs)) : null,
      },
      { onConflict: 'room_id,player_id', ignoreDuplicates: true }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request payload' },
      { status: 400 }
    );
  }
}
