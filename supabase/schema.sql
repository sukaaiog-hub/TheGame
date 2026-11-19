-- Red Eclipse 2 multiplayer persistence schema for Supabase/Postgres
-- Run in Supabase → SQL Editor. Safe to re-run (idempotent).

create table if not exists players (
  id            bigint primary key generated always as identity,
  auth_key      text unique not null,
  name          text not null,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  total_kills   integer not null default 0,
  total_deaths  integer not null default 0,
  total_score   integer not null default 0,
  total_games   integer not null default 0,
  total_time_s  bigint  not null default 0
);

create table if not exists matches (
  id          bigint primary key generated always as identity,
  server_id   text not null,
  map         text not null,
  mode        text not null,
  started_at  timestamptz not null,
  ended_at    timestamptz not null,
  duration_s  integer not null,
  winner      text,
  created_at  timestamptz not null default now()
);

create index if not exists matches_server_time on matches (server_id, ended_at desc);
create index if not exists matches_map on matches (map);

create table if not exists match_players (
  match_id  bigint not null references matches(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  team      text,
  kills     integer not null default 0,
  deaths    integer not null default 0,
  score     integer not null default 0,
  primary key (match_id, player_id)
);

create index if not exists match_players_player on match_players (player_id);

create or replace view leaderboard
with (security_invoker = true) as
select
  id,
  name,
  total_kills,
  total_deaths,
  total_score,
  total_games,
  total_time_s,
  case when total_deaths = 0 then total_kills::numeric
       else round(total_kills::numeric / total_deaths, 2) end as kd,
  last_seen
from players
where total_games > 0
order by total_score desc;

create or replace function record_match(
  p_server_id text,
  p_map       text,
  p_mode      text,
  p_started   timestamptz,
  p_ended     timestamptz,
  p_winner    text,
  p_players   jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id bigint;
  v_player   jsonb;
  v_pid      bigint;
  v_dur      integer;
begin
  v_dur := greatest(0, extract(epoch from (p_ended - p_started))::int);

  insert into matches (server_id, map, mode, started_at, ended_at, duration_s, winner)
  values (p_server_id, p_map, p_mode, p_started, p_ended, v_dur, p_winner)
  returning id into v_match_id;

  for v_player in select * from jsonb_array_elements(p_players) loop
    insert into players (auth_key, name)
    values (v_player->>'auth_key', v_player->>'name')
    on conflict (auth_key) do update
      set name = excluded.name, last_seen = now()
    returning id into v_pid;

    insert into match_players (match_id, player_id, team, kills, deaths, score)
    values (v_match_id, v_pid,
            v_player->>'team',
            coalesce((v_player->>'kills')::int, 0),
            coalesce((v_player->>'deaths')::int, 0),
            coalesce((v_player->>'score')::int, 0))
    on conflict (match_id, player_id) do nothing;

    update players set
      total_kills  = total_kills  + coalesce((v_player->>'kills')::int, 0),
      total_deaths = total_deaths + coalesce((v_player->>'deaths')::int, 0),
      total_score  = total_score  + coalesce((v_player->>'score')::int, 0),
      total_games  = total_games + 1,
      total_time_s = total_time_s + v_dur,
      last_seen    = now()
    where id = v_pid;
  end loop;

  return v_match_id;
end;
$$;

revoke all on function record_match(text, text, text, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function record_match(text, text, text, timestamptz, timestamptz, text, jsonb) to service_role;

alter table players       enable row level security;
alter table matches       enable row level security;
alter table match_players enable row level security;

drop policy if exists "public read players" on players;
create policy "public read players" on players for select using (true);

drop policy if exists "public read matches" on matches;
create policy "public read matches" on matches for select using (true);

drop policy if exists "public read match_players" on match_players;
create policy "public read match_players" on match_players for select using (true);
