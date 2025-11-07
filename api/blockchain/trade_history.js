/* eslint-env node */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, wallet')
  if ((req.method || 'GET') === 'OPTIONS') return res.status(204).end()
  if ((req.method || 'GET') !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).send('Method Not Allowed')
  }
  try {
    const upstream = 'https://havenserver.com/blockchain/trade_history'
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
    }
    const up = await fetch(upstream, init)
    const text = await up.text()
    res.status(up.status)
    try { res.json(JSON.parse(text)) } catch { res.send(text) }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/blockchain/trade_history] error', err)
    res.status(500).json({ error: 'Upstream request failed' })
  }
}


