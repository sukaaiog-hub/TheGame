/**
 * Red Eclipse server status API — runs on Vercel (Node serverless).
 *
 * Browsers can't open UDP sockets, so this function cannot "ping the game server"
 * the way a native client would. It talks to the small HTTP status agent that runs
 * next to the game server on the VPS (see status-agent/agent.js), which is the only
 * place that can legitimately speak the ENet query protocol.
 *
 * Deploy:  put this at api/status.js in a Vercel project,
 *          set STATUS_AGENT_URL in the Vercel dashboard.
 *
 *   GET /api/status  ->  { online, players, maxplayers, map, mode, name, ... }
 */
export default async function handler(req, res) {
  const agent = process.env.STATUS_AGENT_URL;
  if (!agent) {
    return res.status(500).json({
      error: 'STATUS_AGENT_URL not configured',
      hint: 'Set it in Vercel → Project → Settings → Environment Variables',
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    const headers = { 'user-agent': 'redeclipse-status/1.0' };
    if (process.env.AGENT_TOKEN) {
      headers['x-agent-token'] = process.env.AGENT_TOKEN;
    }

    const upstream = await fetch(`${agent.replace(/\/$/, '')}/status`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      throw new Error(`agent returned ${upstream.status}`);
    }
    const data = await upstream.json();

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json({ online: true, ...data });
  } catch (err) {
    return res.status(200).json({
      online: false,
      players: 0,
      error: err.name === 'AbortError' ? 'status agent timed out' : String(err.message || err),
    });
  }
}
