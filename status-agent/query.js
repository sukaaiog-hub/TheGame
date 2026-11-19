#!/usr/bin/env node
/**
 * Red Eclipse 2 server status query — verified against v2.0.0 source.
 *
 * The server answers status queries on its **ping port** (28802) with a raw UDP
 * datagram — no ENet handshake. Verified in engine/server.cpp:
 *     checkserversockets() -> enet_socket_receive(pongsock) -> server::queryreply()
 *
 * WIRE FORMAT (shared/tools.cpp, exact):
 *   putint(n):  -127 < n < 128        -> [n]
 *               -0x8000 <= n < 0x8000 -> [0x80, n & 0xff, (n >> 8) & 0xff]
 *               else                  -> [0x81, n & 0xff, (n >> 8) & 0xff,
 *                                            (n >> 16) & 0xff, (n >> 24) & 0xff]
 *   sendstring(s):  each byte as putint, then putint(0)
 *
 * QUERY REPLY (game/server.cpp:queryreply):
 *   putint(nplayers), putint(15), 15 x putint(attr),
 *   sendstring(map), sendstring(serverdesc), sendstring(versionbranch),
 *   nplayers x sendstring(name), nplayers x sendstring(handle)
 *
 * Usage:  node query.js <host> [port]
 */
'use strict';
const dgram = require('dgram');

const MODES = [
  'demo', 'edit', 'dm', 'tdm', 'ctf', 'bot', 'bomber', 'campaign', 'campaignSP',
  'campaignMP', 'defend', 'botdefend', 'charger', 'dodgeball', 'duel', 'frag',
  'goalkeeper', 'hunt', 'hunter', 'invasion', 'kamikaze', 'kaboom', 'legate',
  'mmission', 'muts', 'regen', 'regencapture', 'superbot', 'traitor', 'trial',
];

function putInt(n) {
  if (n > -127 && n < 128) return Buffer.from([n & 0xff]);
  if (n >= -0x8000 && n < 0x8000) return Buffer.from([0x80, n & 0xff, (n >> 8) & 0xff]);
  return Buffer.from([0x81, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

class Reader {
  constructor(buf, start = 0) { this.b = buf; this.i = start; }
  get() { return this.i < this.b.length ? this.b[this.i++] : null; }
  int() {
    const c0 = this.get();
    if (c0 === null) return null;
    const c = (c0 << 24) >> 24;
    if (c === -128) {
      const a = this.get(), b = this.get();
      if (a === null || b === null) return null;
      return (a | (b << 8)) | 0;
    }
    if (c === -127) {
      const a = this.get(), b = this.get(), d = this.get(), e = this.get();
      if ([a, b, d, e].includes(null)) return null;
      return a | (b << 8) | (d << 16) | (e << 24);
    }
    return c;
  }
  str() {
    const bytes = [];
    for (;;) {
      const v = this.int();
      if (v === null || v === 0) break;
      bytes.push(v & 0xff);
    }
    return Buffer.from(bytes).toString('utf8');
  }
}

function query(host, port = 28802, timeout = 2500) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { sock.close(); } catch {} resolve(v); };
    const timer = setTimeout(() => finish({ online: false, error: 'timeout' }), timeout);

    sock.on('error', (e) => { clearTimeout(timer); finish({ online: false, error: e.message }); });

    const req = putInt(1);
    const reqLen = req.length;

    sock.on('message', (msg) => {
      clearTimeout(timer);
      try {
        const r = new Reader(msg, Math.min(reqLen, msg.length));
        const players = r.int();
        const nattrs = r.int();
        const attrs = [];
        for (let i = 0; i < (nattrs || 0); i++) attrs.push(r.int());
        const map = r.str();
        const desc = r.str();
        const branch = r.str();
        const names = [];
        for (let i = 0; i < (players || 0); i++) names.push(r.str());
        const handles = [];
        for (let i = 0; i < (players || 0); i++) handles.push(r.str());

        finish({
          online: true,
          players: players || 0,
          maxplayers: attrs[4] ?? null,
          mode: MODES[attrs[1]] ?? String(attrs[1]),
          protocol: attrs[0] ?? null,
          mutators: attrs[2] ?? 0,
          time_remaining: attrs[3] ?? null,
          passworded: attrs[5] === 2,
          map: map || null,
          name: desc || null,
          branch: branch || null,
          player_names: names,
          handles,
          raw_attrs: attrs,
          bytes: msg.length,
        });
      } catch (e) {
        finish({ online: false, error: 'parse: ' + e.message });
      }
    });

    sock.bind(() => { sock.send(req, port, host); });
  });
}

if (require.main === module) {
  const host = process.argv[2] || '127.0.0.1';
  const port = Number(process.argv[3] || 28802);
  query(host, port).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.online ? 0 : 1);
  });
}

module.exports = { query, putInt, Reader, MODES };
