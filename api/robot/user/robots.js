/* eslint-env node */
const UPSTREAM = 'https://havenserver.com/robot/user/robots'

export default async function handler(req, res) {
  if ((req.method || 'GET') === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, wallet')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.status(204).end()
  }
  if ((req.method || 'GET') !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).end('Method Not Allowed')
  }
  try {
    const wallet = req.headers?.wallet || ''
    const upstream = await fetch(UPSTREAM, { method: 'GET', headers: wallet ? { wallet } : {} })
    const text = await upstream.text()
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(upstream.status).send(text)
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(502).json({ error: 'Upstream error', detail: String(err) })
  }
}


