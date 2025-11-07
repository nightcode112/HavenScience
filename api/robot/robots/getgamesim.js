/* eslint-env node */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, wallet')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.status(204).end()
  }
  
  try {
    // Accept POST from frontend, send POST to backend
    const body = req.body || {}
    
    const upstreamResponse = await fetch('https://havenserver.com/robot/robots/getgamesim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    
    const text = await upstreamResponse.text()
    
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    return res.status(upstreamResponse.status).send(text)
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(502).json({ error: 'Upstream error', detail: String(err) })
  }
}