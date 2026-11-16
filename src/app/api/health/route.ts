import { NextResponse } from 'next/server';

export async function GET() {
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return NextResponse.json({
    ok: true,
    service: 'tuxkart-rush',
    supabaseConfigured: hasSupabaseUrl && hasAnonKey,
    timestamp: new Date().toISOString(),
  });
}
