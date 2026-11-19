'use strict';

const assert = require('assert');
const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { query, putInt } = require('../status-agent/query');
const { stripColour } = require('../status-agent/agent');

function sendString(bufs, str) {
  const b = Buffer.from(str, 'utf8');
  for (const byte of b) {
    bufs.push(putInt(byte));
  }
  bufs.push(putInt(0));
}

function buildQueryReply(echoBytes, opts) {
  const bufs = [echoBytes];
  const players = opts.players || [];
  bufs.push(putInt(players.length));
  bufs.push(putInt(15));
  const attrs = [
    opts.protocol ?? 245,
    opts.modeIndex ?? 2, // dm
    opts.mutators ?? 0,
    opts.timeremaining ?? 420,
    opts.maxslots ?? 16,
    opts.mastermode ?? 0,
    0, 0, 2, 0, 0, 0, 0, 0, opts.timeremaining ?? 420,
  ];
  for (const a of attrs) bufs.push(putInt(a));
  sendString(bufs, opts.map || 'rift');
  sendString(bufs, opts.desc || 'Red Eclipse - Public DM');
  sendString(bufs, opts.branch || '2.0.0');
  for (const p of players) sendString(bufs, p.name);
  for (const p of players) sendString(bufs, p.handle || '');
  return Buffer.concat(bufs);
}

function makeMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function run() {
  // 1. Test query.js wire parsing against an ephemeral UDP RE2 mock server
  const udpServer = dgram.createSocket('udp4');
  await new Promise((resolve) => udpServer.bind(0, '127.0.0.1', resolve));
  const udpPort = udpServer.address().port;

  udpServer.on('message', (msg, rinfo) => {
    const reply = buildQueryReply(msg, {
      map: 'rift',
      desc: 'Red Eclipse - Public DM',
      players: [
        { name: '\fgAlphaPlayer', handle: 'alpha' },
        { name: '\frBravoBot', handle: '' },
      ],
    });
    udpServer.send(reply, rinfo.port, rinfo.address);
  });

  const qRes = await query('127.0.0.1', udpPort, 1500);
  assert.strictEqual(qRes.online, true);
  assert.strictEqual(qRes.players, 2);
  assert.strictEqual(qRes.maxplayers, 16);
  assert.strictEqual(qRes.mode, 'dm');
  assert.strictEqual(qRes.protocol, 245);
  assert.strictEqual(qRes.map, 'rift');
  assert.strictEqual(qRes.name, 'Red Eclipse - Public DM');
  assert.deepStrictEqual(qRes.player_names.map(stripColour), ['AlphaPlayer', 'BravoBot']);

  // 2. Test agent.js HTTP endpoint pointing to mock UDP server
  process.env.GAME_HOST = '127.0.0.1';
  process.env.PUBLIC_HOST = '203.0.113.10';
  process.env.PING_PORT = String(udpPort);
  process.env.CACHE_MS = '0';
  delete require.cache[require.resolve('../status-agent/agent')];
  const agentMod = require('../status-agent/agent');
  await new Promise((resolve) => agentMod.server.listen(0, '127.0.0.1', resolve));
  const agentPort = agentMod.server.address().port;

  const agentHealth = await fetch(`http://127.0.0.1:${agentPort}/health`);
  assert.strictEqual(agentHealth.status, 200);
  assert.strictEqual(await agentHealth.text(), 'ok');

  const agentStatusRes = await fetch(`http://127.0.0.1:${agentPort}/status`);
  const agentJson = await agentStatusRes.json();
  assert.strictEqual(agentJson.online, true);
  assert.strictEqual(agentJson.players, 2);
  assert.deepStrictEqual(agentJson.player_names, ['AlphaPlayer', 'BravoBot']);
  assert.strictEqual(agentJson.join_url, `redeclipse://203.0.113.10:${udpPort - 1}`);

  // 3. Test Vercel api/status.js handler (unconfigured + live agent + offline fallback)
  const { default: statusHandler } = await import('../api/status.js');
  delete process.env.STATUS_AGENT_URL;
  const resUnconf = makeMockRes();
  await statusHandler({}, resUnconf);
  assert.strictEqual(resUnconf.statusCode, 500);
  assert.strictEqual(resUnconf.body.error, 'STATUS_AGENT_URL not configured');

  process.env.STATUS_AGENT_URL = `http://127.0.0.1:${agentPort}`;
  const resLive = makeMockRes();
  await statusHandler({}, resLive);
  assert.strictEqual(resLive.statusCode, 200);
  assert.strictEqual(resLive.body.online, true);
  assert.strictEqual(resLive.body.map, 'rift');

  // 4. Test Vercel api/leaderboard.js handler when env vars unset
  const { default: lbHandler } = await import('../api/leaderboard.js');
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resLb = makeMockRes();
  await lbHandler({}, resLb);
  assert.strictEqual(resLb.statusCode, 200);
  assert.strictEqual(resLb.body.configured, false);
  assert.deepStrictEqual(resLb.body.leaderboard, []);

  // 5. Verify public/index.html has no external asset dependencies
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert(!/<script[^>]+src=/i.test(html), 'public/index.html must inline all scripts');
  assert(!/<link[^>]+href=/i.test(html), 'public/index.html must inline all styles');
  assert(html.includes('/api/status'), 'public/index.html must fetch /api/status');
  assert(html.includes('/api/leaderboard'), 'public/index.html must fetch /api/leaderboard');
  assert(html.includes('redeclipse://'), 'public/index.html must support redeclipse:// links');

  await new Promise((resolve) => agentMod.server.close(resolve));
  await new Promise((resolve) => udpServer.close(resolve));
  console.log('ALL VERIFICATION CHECKS PASSED (UDP query, HTTP status-agent, Vercel API handlers, static portal)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
