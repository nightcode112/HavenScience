/* eslint-env node */
import { proxyRobot } from './[...path].js'

export default async function handler(req, res) {
  // Map /api/robot/create → upstream /robot/create
  return proxyRobot(req, res, ['create'])
}


