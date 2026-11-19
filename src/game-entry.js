/**
 * Entry point bundled into public/game.bundle.js.
 * Wires the portal launcher, online rooms (Supabase Realtime), leaderboard,
 * VPS status, and the full-screen WebGL2 Red Eclipse 2 arena.
 */
import { ArenaGameEngine } from './game-engine.js';
import { WEAPONS } from './weapons.js';
import { RealtimeArenaClient, randomRoomCode } from './multiplayer.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPersistentPlayerId() {
  try {
    let id = localStorage.getItem('re2_player_id');
    if (!id) {
      id = `web_${crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('re2_player_id', id);
    }
    return id;
  } catch {
    return `web_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function getSavedName() {
  try {
    return localStorage.getItem('re2_callsign') || 'RiftRunner';
  } catch {
    return 'RiftRunner';
  }
}

function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function initPortal() {
  const $ = (id) => document.getElementById(id);

  let runtimeConfig = { supabaseUrl: '', supabaseAnonKey: '', realtimeEnabled: false };
  let activeEngine = null;
  let activeRealtime = null;
  let joinedRoomMeta = null;

  const nameInput = $('playerNameInput');
  if (nameInput) nameInput.value = getSavedName();

  // Check URL ?room=CODE invite
  const urlParams = new URLSearchParams(window.location.search);
  const inviteRoom = (urlParams.get('room') || '').trim().toUpperCase();
  if (inviteRoom && $('roomCodeInput')) {
    $('roomCodeInput').value = inviteRoom;
  }

  // Tab switching
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-panel]').forEach((p) => {
        p.style.display = p.getAttribute('data-panel') === target ? 'block' : 'none';
      });
      if (target === 'leaderboard') refreshLeaderboard();
      if (target === 'server') refreshServerStatus();
    });
  });

  async function loadConfig() {
    try {
      const r = await fetch('/api/config');
      if (r.ok) {
        runtimeConfig = await r.json();
        const badge = $('rtStatusBadge');
        if (badge) {
          badge.textContent = runtimeConfig.realtimeEnabled ? 'Realtime Ready' : 'Solo + Bots';
          badge.className = `pill ${runtimeConfig.realtimeEnabled ? 'ok' : 'warn'}`;
        }
      }
    } catch {}
  }

  async function refreshLeaderboard() {
    const lbStatus = $('lbStatus');
    const lbBody = $('lbBody');
    const matchesBody = $('matchesBody');
    try {
      const r = await fetch('/api/leaderboard');
      const d = await r.json();
      if (!d.configured) {
        lbStatus.textContent = d.reason || 'Supabase not configured';
        lbStatus.className = 'pill warn';
        return;
      }
      lbStatus.textContent = 'Supabase Live';
      lbStatus.className = 'pill ok';
      if (!d.leaderboard || d.leaderboard.length === 0) {
        lbBody.innerHTML = '<tr><td colspan="6" class="muted">No matches recorded yet — finish a browser arena match to claim #1!</td></tr>';
      } else {
        lbBody.innerHTML = d.leaderboard.slice(0, 25).map((p, i) => `
          <tr>
            <td><strong>#${i + 1}</strong></td>
            <td>${esc(p.name)}</td>
            <td>${p.kills}</td>
            <td>${p.deaths}</td>
            <td><strong>${p.kd}</strong></td>
            <td>${p.matches}</td>
          </tr>
        `).join('');
      }
      if (!d.recentMatches || d.recentMatches.length === 0) {
        matchesBody.innerHTML = '<tr><td colspan="5" class="muted">No recent matches yet.</td></tr>';
      } else {
        matchesBody.innerHTML = d.recentMatches.map((m) => `
          <tr>
            <td><span class="badge-map">${esc(m.map)}</span></td>
            <td>${esc(m.mode)}</td>
            <td><strong>${esc(m.winner || '—')}</strong></td>
            <td>${m.duration_s ? `${m.duration_s}s` : '—'}</td>
            <td>${esc(m.server_id)}</td>
          </tr>
        `).join('');
      }
    } catch (e) {
      if (lbStatus) {
        lbStatus.textContent = `Error: ${e.message}`;
        lbStatus.className = 'pill bad';
      }
    }
  }

  async function refreshServerStatus() {
    const stateBadge = $('srvState');
    const playersBody = $('playersBody');
    try {
      const r = await fetch('/api/status');
      const d = await r.json();
      if (!r.ok) {
        stateBadge.textContent = 'Awaiting VPS';
        stateBadge.className = 'pill warn';
        $('srvMap').textContent = 'Browser WebGL Active (No VPS needed)';
        $('srvPlayers').textContent = '—';
        $('srvAddress').textContent = d.error || 'Optional native VPS offline';
        $('joinBtn').removeAttribute('href');
        $('joinBtn').setAttribute('aria-disabled', 'true');
        playersBody.innerHTML = '<tr><td colspan="2" class="muted">Native VPS not linked yet — play right in your browser above!</td></tr>';
        return;
      }
      stateBadge.textContent = d.online ? 'Native VPS Online' : 'Offline';
      stateBadge.className = `pill ${d.online ? 'ok' : 'bad'}`;
      $('srvMap').textContent = `${d.map || '—'} (${d.modeName || 'DM'})`;
      $('srvPlayers').textContent = `${d.clients}/${d.maxClients}`;
      const addr = `${d.host}:${d.port}`;
      $('srvAddress').textContent = addr;
      $('joinBtn').href = `redeclipse://${addr}`;
      $('joinBtn').removeAttribute('aria-disabled');
      playersBody.innerHTML = (d.players && d.players.length)
        ? d.players.map((n, i) => `<tr><td>${i + 1}</td><td>${esc(n)}</td></tr>`).join('')
        : '<tr><td colspan="2" class="muted">Server empty</td></tr>';
    } catch {
      if (stateBadge) {
        stateBadge.textContent = 'Optional VPS';
        stateBadge.className = 'pill warn';
      }
    }
  }

  // Online Room Create / Join via Supabase Realtime
  async function connectRoom(code, isHost) {
    if (!runtimeConfig.realtimeEnabled) {
      $('roomStatusMsg').textContent = 'Realtime unavailable — launching with AI bots.';
      return;
    }
    const cleanCode = (code || randomRoomCode()).trim().toUpperCase();
    const playerName = (nameInput?.value || 'RiftRunner').trim().slice(0, 20) || 'RiftRunner';
    try {
      localStorage.setItem('re2_callsign', playerName);
    } catch {}

    if (activeRealtime) await activeRealtime.leave();
    activeRealtime = new RealtimeArenaClient(runtimeConfig);

    $('roomStatusMsg').textContent = `Connecting to room ${cleanCode}...`;
    const mapId = $('mapSelect').value;
    const mode = $('modeSelect').value;

    activeRealtime.on('presence', (peers) => {
      const box = $('roomPeersList');
      if (box) {
        box.innerHTML = peers.map((p) => `<span class="peer-chip">${esc(p.name)}${p.isHost ? ' (Host)' : ''}</span>`).join('');
      }
      $('roomStatusMsg').textContent = `Room ${cleanCode} live · ${peers.length} player(s) connected`;
    });

    activeRealtime.on('room_meta', (meta) => {
      joinedRoomMeta = meta;
      if (meta.mapId && $('mapSelect')) $('mapSelect').value = meta.mapId;
      if (meta.mode && $('modeSelect')) $('modeSelect').value = meta.mode;
    });

    await activeRealtime.joinRoom({
      roomCode: cleanCode,
      playerId: getPersistentPlayerId(),
      playerName,
      team: isHost ? 'alpha' : 'omega',
      mapId,
      mode,
      isHost,
    });

    if (isHost) {
      activeRealtime.sendRoomMeta({ mapId, mode });
    }
    $('roomCodeDisplay').textContent = cleanCode;
    $('roomInviteBox').style.display = 'flex';
    const inviteUrl = `${window.location.origin}/?room=${cleanCode}`;
    $('inviteLinkInput').value = inviteUrl;
  }

  $('createRoomBtn')?.addEventListener('click', async () => {
    try {
      await connectRoom(randomRoomCode(), true);
    } catch (e) {
      $('roomStatusMsg').textContent = `Room error: ${e.message}`;
    }
  });

  $('joinRoomBtn')?.addEventListener('click', async () => {
    const code = $('roomCodeInput')?.value?.trim();
    if (!code) {
      $('roomStatusMsg').textContent = 'Enter a 6-character room code first.';
      return;
    }
    try {
      await connectRoom(code, false);
    } catch (e) {
      $('roomStatusMsg').textContent = `Join failed: ${e.message}`;
    }
  });

  $('copyInviteBtn')?.addEventListener('click', () => {
    const val = $('inviteLinkInput')?.value;
    if (val && navigator.clipboard) {
      navigator.clipboard.writeText(val).catch(() => {});
      $('copyInviteBtn').textContent = 'Copied!';
      setTimeout(() => { $('copyInviteBtn').textContent = 'Copy Invite Link'; }, 1500);
    }
  });

  // Launch Game
  function launchArena() {
    if (activeEngine) {
      activeEngine.destroy();
      activeEngine = null;
    }
    const playerName = (nameInput?.value || 'RiftRunner').trim().slice(0, 20) || 'RiftRunner';
    try {
      localStorage.setItem('re2_callsign', playerName);
    } catch {}

    const mapId = joinedRoomMeta?.mapId || $('mapSelect').value;
    const mode = joinedRoomMeta?.mode || $('modeSelect').value;
    const botCount = Number($('botsSelect').value);
    const botDifficulty = $('diffSelect').value;
    const durationSec = Number($('timeSelect').value);
    const fragLimit = Number($('fragSelect').value);

    $('portalShell').style.display = 'none';
    $('arenaOverlay').style.display = 'block';
    $('endMatchModal').style.display = 'none';

    const canvas = $('arenaCanvas');
    activeEngine = new ArenaGameEngine({
      canvas,
      config: {
        playerId: getPersistentPlayerId(),
        playerName,
        mapId,
        mode,
        botCount,
        botDifficulty,
        durationSec,
        fragLimit,
        sensitivity: Number($('sensInput')?.value || 0.0022),
      },
      realtime: activeRealtime,
      onHudUpdate: renderHud,
      onMatchEnd: handleMatchEnd,
      onExit: exitArena,
    });
    activeEngine.start();
  }

  function renderHud(hud) {
    $('hudHp').textContent = hud.hp;
    $('hudHpFill').style.width = `${Math.max(0, Math.min(100, hud.hp))}%`;
    $('hudImpulse').textContent = hud.impulse;
    $('hudImpulseFill').style.width = `${Math.max(0, Math.min(100, hud.impulse))}%`;
    $('hudClock').textContent = formatClock(hud.timeLeft);
    $('hudFrags').textContent = `${hud.kills} / ${hud.fragLimit >= 900 ? '∞' : hud.fragLimit}`;
    $('hudWeaponName').textContent = hud.weapon.name.toUpperCase();
    $('hudWeaponName').style.color = hud.weapon.hex;
    $('hudAmmo').textContent = hud.clipSize >= 900 ? '∞' : (hud.reloading ? 'RELOAD...' : `${hud.ammo} / ${hud.clipSize}`);
    $('hudSpeed').textContent = `${hud.speed.toFixed(1)} m/s`;

    $('hudCrosshair').style.display = hud.scoped ? 'none' : 'block';
    $('hudScope').style.display = hud.scoped ? 'block' : 'none';
    $('hudHitmarker').style.opacity = hud.hitmarker ? '1' : '0';
    $('hudHitmarker').classList.toggle('head', hud.hitmarkerHead);
    $('hudDamageFlash').style.opacity = Math.min(0.6, hud.damageFlash).toFixed(2);
    $('hudPauseMenu').style.display = hud.paused && hud.alive ? 'flex' : 'none';
    $('hudRespawn').style.display = !hud.alive ? 'flex' : 'none';
    $('hudRespawnSec').textContent = hud.respawnTimer;
    $('hudTrick').textContent = hud.trick;
    $('hudTrick').style.opacity = hud.trick ? '1' : '0';

    $('hudWeaponBar').innerHTML = hud.ownedWeapons.map((id) => {
      const w = WEAPONS[id];
      const active = id === hud.weapon.id;
      return `<div class="wslot ${active ? 'active' : ''}" style="border-color:${active ? w.hex : 'rgba(255,255,255,0.12)'}"><span>${w.slot}</span><strong>${w.name}</strong></div>`;
    }).join('');

    $('hudKillfeed').innerHTML = hud.killfeed.map((k) =>
      `<div class="kf-row"><span>${esc(k.killer)}</span> <em style="color:${k.color}">[${esc(k.weapon)}${k.headshot ? ' ★' : ''}]</em> <span>${esc(k.victim)}</span></div>`
    ).join('');

    const sb = $('hudScoreboard');
    if (hud.scoreboardOpen) {
      sb.style.display = 'flex';
      $('hudScoreRows').innerHTML = hud.standings.map((s, i) => `
        <tr class="${s.id === activeEngine?.localId ? 'me' : ''}">
          <td>${i + 1}</td>
          <td>${esc(s.name)}${s.isBot ? ' <small>(BOT)</small>' : ''}</td>
          <td>${s.kills}</td>
          <td>${s.deaths}</td>
          <td>${s.score}</td>
        </tr>
      `).join('');
    } else {
      sb.style.display = 'none';
    }
  }

  async function handleMatchEnd(summary) {
    $('hudPauseMenu').style.display = 'none';
    $('endMatchModal').style.display = 'flex';
    $('endWinner').textContent = `Winner: ${summary.winner}`;
    $('endMatchRows').innerHTML = summary.players.map((p, i) => `
      <tr>
        <td>#${i + 1}</td>
        <td><strong>${esc(p.name)}</strong>${p.isBot ? ' (BOT)' : ''}</td>
        <td>${p.kills}</td>
        <td>${p.deaths}</td>
        <td>${p.score}</td>
      </tr>
    `).join('');

    const saveBadge = $('endSaveStatus');
    saveBadge.textContent = 'Saving match to Supabase leaderboard...';
    saveBadge.className = 'pill warn';

    try {
      const r = await fetch('/api/record-browser-match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(summary),
      });
      const out = await r.json();
      if (r.ok && out.ok) {
        saveBadge.textContent = `Saved to Supabase Leaderboard (Match #${out.match_id || 'OK'})`;
        saveBadge.className = 'pill ok';
        refreshLeaderboard();
      } else {
        saveBadge.textContent = `Stats note: ${out.error || 'Could not save match'}`;
        saveBadge.className = 'pill warn';
      }
    } catch (e) {
      saveBadge.textContent = `Offline summary (${e.message})`;
      saveBadge.className = 'pill warn';
    }
  }

  function exitArena() {
    if (activeEngine) {
      activeEngine.destroy();
      activeEngine = null;
    }
    $('arenaOverlay').style.display = 'none';
    $('portalShell').style.display = 'block';
    refreshLeaderboard();
  }

  $('playNowBtn')?.addEventListener('click', launchArena);
  $('resumeBtn')?.addEventListener('click', () => activeEngine?.requestLock());
  $('exitArenaBtn')?.addEventListener('click', exitArena);
  $('playAgainBtn')?.addEventListener('click', launchArena);
  $('endLobbyBtn')?.addEventListener('click', exitArena);
  $('sensInput')?.addEventListener('input', (e) => {
    if (activeEngine) activeEngine.sensitivity = Number(e.target.value);
  });

  loadConfig().then(() => {
    if (inviteRoom && runtimeConfig.realtimeEnabled) {
      connectRoom(inviteRoom, false).catch(() => {});
    }
  });
  refreshLeaderboard();
  refreshServerStatus();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPortal);
  } else {
    initPortal();
  }
}
