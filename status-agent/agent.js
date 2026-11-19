#!/usr/bin/env node
/**
 * Red Eclipse status agent — runs on the VPS next to the game server.
 * Vercel's /api/status calls this over HTTP; this process does the UDP work.
 *
 * Run:  GAME_HOST=127.0.0.1 PING_PORT=28802 PORT=8080 node agent.js
 */
'use strict';
const http = require('http');
const { query } = require('./query');

const GAME_HOST = process.env.GAME_HOST || '127.0.0.1';
const PUBLIC_HOST = process.env.PUBLIC_HOST || GAME_HOST;
const PING_PORT = Number(process.env.PING_PORT || 28802);
const PORT = Number(process.env.PORT || 8080);
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const CACHE_MS = Number(process.env.CACHE_MS || 2000);

let cache = { at: 0, data: null };

async function getStatus(force = false) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_MS) return cache.data;

  const res = await query(GAME_HOST, PING_PORT, 2000);
  const data = res.online
    ? {
        online: true,
        players: res.players,
        maxplayers: res.maxplayers,
        map: res.map,
        mode: res.mode,
        name: res.name,
        branch: res.branch,
        protocol: res.protocol,
        passworded: res.passworded,
        player_names: (res.player_names || []).map(stripColour),
        address: `${PUBLIC_HOST}:${PING_PORT - 1}`,
        join_url: `redeclipse://${PUBLIC_HOST}:${PING_PORT - 1}`,
      }
    : { online: false, players: 0, error: res.error };

  data.queried_at = new Date().toISOString();
  cache = { at: now, data };
  return data;
}

function stripColour(s) {
  return String(s)
    .replace(/\f[subrgcywmkoBAHIKLMRSTUVWXYZ(]/g, '')
    .replace(/\f\[[0-9a-fA-F]+\]/g, '')
    .trim();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (AGENT_TOKEN && req.headers['x-agent-token'] !== AGENT_TOKEN) {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  if (url.pathname === '/status' || url.pathname === '/') {
    try {
      const body = await getStatus(url.searchParams.has('fresh'));
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      return res.end(JSON.stringify(body, null, 2));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ online: false, error: String(e.message || e) }));
    }
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`status agent :${PORT} -> game ${GAME_HOST}:${PING_PORT}`);
  });
}

module.exports = { server, getStatus, stripColour };
