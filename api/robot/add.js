/* eslint-env node */
import { proxyRobot } from './[...path].js'

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).end('Method Not Allowed')
  }

  return proxyRobot(req, res, ['add'])
}

