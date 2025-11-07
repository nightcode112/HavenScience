/* eslint-env node */
const UPSTREAM = 'https://havenserver.com/robot/sim/load-simulation'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, wallet',
  'Access-Control-Max-Age': '86400',
}

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v)
}

export default async function handler(req, res) {
  if ((req.method || 'GET') === 'OPTIONS') {
    applyCors(res)
    return res.status(204).end()
  }

  try {
    const wallet = req.headers?.wallet || req.headers?.Wallet || ''
    const body = req.body ? JSON.stringify(req.body) : undefined
    const headers = { 'Content-Type': 'application/json' }
    if (wallet) headers['wallet'] = wallet

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers,
      body,
    })

    const text = await upstream.text()
    applyCors(res)
    return res.status(upstream.status).send(text)
  } catch (err) {
    applyCors(res)
    return res.status(502).json({ error: 'Upstream error', detail: String(err) })
  }
}
