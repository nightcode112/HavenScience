/* eslint-env node */
import { proxyRobot } from '../[...path].js'

export default async function handler(req, res) {
  // Delegate to proxy with explicit path parts so body mapping works
  return proxyRobot(req, res, ['command', 'add-command'])
}


