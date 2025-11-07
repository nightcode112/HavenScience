/* eslint-env node */
const UPSTREAM_BASE = 'https://havenserver.com/agent'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, wallet',
  'Access-Control-Max-Age': '86400',
}

function applyCors(res) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value)
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(res)
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    applyCors(res)
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const upstreamUrl = `${UPSTREAM_BASE}/agent_llm_command`

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    // Forward wallet header if present
    if (req.headers.wallet) {
      headers['wallet'] = req.headers.wallet
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    })

    const data = await upstreamResponse.text()

    // Forward response headers
    for (const [key, value] of upstreamResponse.headers.entries()) {
      const lower = key.toLowerCase()
      if (lower === 'transfer-encoding' || lower === 'content-length') continue
      res.setHeader(key, value)
    }

    applyCors(res)
    res.status(upstreamResponse.status)
    res.send(data)
  } catch (err) {
    applyCors(res)
    res.status(502).json({ error: 'Upstream error', detail: String(err) })
  }
}
