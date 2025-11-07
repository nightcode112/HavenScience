const simulationCache = new Map()

const normalizeWallet = (wallet) => {
  if (!wallet || typeof wallet !== 'string') return null
  return wallet.toLowerCase()
}

export const getSimulationMap = (wallet) => {
  const key = normalizeWallet(wallet)
  if (!key) return null
  return simulationCache.get(key) || null
}

export const getSimulation = (wallet, deviceNode) => {
  const key = normalizeWallet(wallet)
  if (!key || !deviceNode) return null
  const map = simulationCache.get(key)
  if (!map) return null
  return map.get(deviceNode) || null
}

export const getSimulationId = (wallet, deviceNode) => {
  const simulation = getSimulation(wallet, deviceNode)
  return simulation?.simulation_id || null
}

export const setSimulation = (wallet, deviceNode, simulation) => {
  const key = normalizeWallet(wallet)
  if (!key || !deviceNode || !simulation) return
  const map = simulationCache.get(key) || new Map()
  const resolvedDeviceNode = deviceNode || simulation.device_node || simulation.parent_device_node
  if (!resolvedDeviceNode) return
  map.set(resolvedDeviceNode, { device_node: resolvedDeviceNode, ...simulation })
  simulationCache.set(key, map)
}

export const primeSimulations = (wallet, simulations = []) => {
  const key = normalizeWallet(wallet)
  if (!key || !Array.isArray(simulations)) return

  const map = simulationCache.get(key) || new Map()
  simulations.forEach((simulation) => {
    if (!simulation) return
    const dev = simulation.device_node || simulation.parent_device_node
    if (!dev) return

    // If multiple simulations exist for the same device_node, keep the most recent one
    const existing = map.get(dev)
    if (existing) {
      const existingDate = new Date(existing.updated_at || existing.created_at || 0).getTime()
      const currentDate = new Date(simulation.updated_at || simulation.created_at || 0).getTime()
      // Skip if existing is more recent
      if (existingDate > currentDate) return
    }

    map.set(dev, { device_node: dev, ...simulation })
  })

  simulationCache.set(key, map)
}

export const updateSimulation = (wallet, deviceNode, updates = {}) => {
  const key = normalizeWallet(wallet)
  if (!key || !deviceNode) return
  const map = simulationCache.get(key)
  if (!map) return
  const target = deviceNode
  const current = map.get(target) || { device_node: target }
  map.set(target, { ...current, ...updates })
  simulationCache.set(key, map)
}

export const clearWalletSimulations = (wallet) => {
  const key = normalizeWallet(wallet)
  if (!key) return
  simulationCache.delete(key)
}
