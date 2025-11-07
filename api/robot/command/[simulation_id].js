/* eslint-env node */
import { proxyRobot } from '../[...path].js'

export default async function handler(req, res) {
  const { simulation_id } = req.query || {}
  // Map /api/robot/command/<sim> → upstream /robot/<sim>/command
  return proxyRobot(req, res, ['command', String(simulation_id || '')])
}


