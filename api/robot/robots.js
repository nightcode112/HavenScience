/* eslint-env node */

const UPSTREAM_BASE = 'https://havenserver.com/robot'

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

  if ((req.method || 'GET') !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).end('Method Not Allowed')
  }

  const wallet = req.headers?.wallet || req.headers?.Wallet || ''

  try {
    let url
    const init = { method: 'GET', headers: {} }
    if (wallet) {
      // Upstream user robots expects wallet header
      url = `${UPSTREAM_BASE}/user/robots`
      init.headers = { wallet }
    } else {
      url = `${UPSTREAM_BASE}/robots`
    }

    const upstream = await fetch(url, init)
    const text = await upstream.text()

    applyCors(res)
    // Forward upstream status/body verbatim; don't synthesize lists
    return res.status(upstream.status).send(text)
  } catch (err) {
    applyCors(res)
    return res.status(502).json({ error: 'Upstream error', detail: String(err) })
  }
}


