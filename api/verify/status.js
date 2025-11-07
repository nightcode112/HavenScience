/* eslint-env node */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v)
}

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'Y77IKMZ4FF473G6G7CMSETPU5R6CYGU1SB'
const ETHERSCAN_API_BASE = 'https://api-sepolia.etherscan.io/api'

export default async function handler(req, res) {
  if ((req.method || 'GET') === 'OPTIONS') {
    applyCors(res)
    return res.status(204).end()
  }
  if ((req.method || 'GET') !== 'GET') {
    applyCors(res)
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).end('Method Not Allowed')
  }
  const guid = String(req.query?.guid || '')
  if (!guid) {
    applyCors(res)
    return res.status(400).json({ error: 'Missing guid' })
  }
  try {
    const u = `${ETHERSCAN_API_BASE}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(guid)}&apikey=${ETHERSCAN_API_KEY}`
    const upstream = await fetch(u)
    const json = await upstream.json().catch(() => ({}))
    applyCors(res)
    return res.status(200).json(json)
  } catch (e) {
    applyCors(res)
    return res.status(500).json({ error: 'Server error', detail: String(e) })
  }
}


