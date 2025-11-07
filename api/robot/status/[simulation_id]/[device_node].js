/* eslint-env node */
import { proxyRobot } from '../../[...path].js'

export default async function handler(req, res) {
  const { simulation_id, device_node } = req.query || {}
  // Map /api/robot/status/<sim>/<device> → upstream /robot/<sim>/<device>/status
  return proxyRobot(req, res, ['status', String(simulation_id || ''), String(device_node || '')])
}


