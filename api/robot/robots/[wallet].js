/* eslint-env node */
import { proxyRobot } from '../../robot/[...path].js'

export default async function handler(req, res) {
  // Support CORS preflight
  if ((req.method || 'GET') === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, wallet')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.status(204).end()
  }
  const { wallet } = req.query || {}
  // Map /api/robot/robots/<wallet> → upstream /robot/robots/<wallet>
  return proxyRobot(req, res, ['robots', String(wallet || '')])
}


