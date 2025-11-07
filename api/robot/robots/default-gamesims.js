/* eslint-env node */
export default async function handler(req, res) {
  if ((req.method || 'GET') === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, wallet')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.status(204).end()
  }
  try {
    const upstream = await fetch('https://havenserver.com/robot/robots/default-gamesims', { method: 'GET' })
    const text = await upstream.text()
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(upstream.status).send(text)
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(502).json({ error: 'Upstream error', detail: String(err) })
  }
}


