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

  const mapId = request.nextUrl.searchParams.get('mapId');
  let query = supabase
    .from('br_results')
    .select(
      'id, map_id, mode, player_id, nickname, operator_id, placement, kills, damage_dealt, survival_ms, created_at'
    )
    .eq('is_ai', false)
    .order('placement', { ascending: true })
    .order('kills', { ascending: false })
    .order('damage_dealt', { ascending: false })
    .limit(20);

  if (mapId && ['verdan_valley', 'rust_refinery', 'arctic_outpost'].includes(mapId)) {
    query = query.eq('map_id', mapId);
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
      roomId?: string | null;
      mapId?: string;
      mode?: string;
      playerId?: string;
      nickname?: string;
      operatorId?: string;
      isAi?: boolean;
      placement?: number;
      kills?: number;
      damageDealt?: number;
      survivalMs?: number;
    };

    if (
      !body.mapId ||
      !body.playerId ||
      !body.nickname ||
      !body.operatorId ||
      !body.placement ||
      body.survivalMs === undefined
    ) {
      return NextResponse.json({ error: 'Missing required match result fields' }, { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeRoomId = body.roomId && uuidRegex.test(body.roomId) ? body.roomId : null;

    const { error } = await supabase.from('br_results').upsert(
      {
        room_id: safeRoomId,
        map_id: body.mapId,
        mode: body.mode === 'coop_squad' ? 'coop_squad' : 'pvp_royale',
        player_id: body.playerId.slice(0, 64),
        nickname: body.nickname.slice(0, 20),
        operator_id: body.operatorId,
        is_ai: Boolean(body.isAi),
        placement: Math.max(1, Math.round(body.placement)),
        kills: Math.max(0, Math.round(body.kills ?? 0)),
        damage_dealt: Math.max(0, Math.round(body.damageDealt ?? 0)),
        survival_ms: Math.max(1000, Math.round(body.survivalMs)),
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
