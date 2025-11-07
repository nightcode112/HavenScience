/* eslint-env node */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, wallet')
  if ((req.method || 'GET') === 'OPTIONS') return res.status(204).end()
  if ((req.method || 'GET') !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).send('Method Not Allowed')
  }
  try {
    const upstream = 'https://havenserver.com/blockchain/get_main_price'
    const up = await fetch(upstream, { method: 'GET' })
    const text = await up.text()
    res.status(up.status)
    // upstream may return plain text number; try JSON parse else send text
    try { res.json(JSON.parse(text)) } catch { res.send(text) }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/blockchain/get_main_price] error', err)
    res.status(500).json({ error: 'Upstream request failed' })
  }
}


