import { getSimulation } from './simulationCache'

const posToObj = (pos) => {
  if (Array.isArray(pos)) {
    const [x = 0, y = 0, z = 0] = pos
    return { x, y, z }
  }
  if (pos && typeof pos === 'object') return pos
  return { x: 0, y: 0, z: 0 }
}

export const mapSimulationsByDevice = (simulations = []) => {
  const map = new Map()
  if (!Array.isArray(simulations)) return map
  
  simulations.forEach((simulation) => {
    if (!simulation) return
    const deviceNode = simulation.device_node || simulation.parent_device_node
    if (!deviceNode) return
    
    // If multiple simulations exist for the same device_node, keep the most recent one
    const existing = map.get(deviceNode)
    if (existing) {
      const existingDate = new Date(existing.updated_at || existing.created_at || 0).getTime()
      const currentDate = new Date(simulation.updated_at || simulation.created_at || 0).getTime()
      // Skip if existing is more recent
      if (existingDate > currentDate) return
    }
    
    const normStatus = simulation.status ? { ...simulation.status, position: posToObj(simulation.status.position) } : undefined
    map.set(deviceNode, { ...simulation, device_node: deviceNode, status: normStatus })
  })
  
  return map
}

const resolveTicker = (robot) => {
  return robot?.ticker || robot?.symbol || robot?.token?.symbol || ''
}

const resolveContract = (robot) => {
  return (
    robot?.bonding_contract ||
    robot?.bondingContract ||
    robot?.bonding_contract_address ||
    robot?.bondingContractAddress ||
    robot?.contract ||
    robot?.contract_address ||
    robot?.contractAddress ||
    robot?.address ||
    ''
  )
}

const resolveImage = (robot) => {
  return robot?.image || robot?.image_url || robot?.img || robot?.picture || ''
}

const resolveNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const normalizeRobot = (robot, index = 0, { wallet, userSimulationMap } = {}) => {
  const deviceNode = robot?.device_node || robot?.id || `robot_${index}`
  const ticker = resolveTicker(robot)
  const contractAddress = resolveContract(robot)
  const image = resolveImage(robot)
  const baseSimulation = userSimulationMap?.get(deviceNode) || getSimulation(wallet, deviceNode)
  const simStatus = baseSimulation?.status
  const status = (simStatus?.state || robot?.status || 'idle')

  // Determine position and battery with simulation priority
  const positionFromSim = simStatus?.position
  const normalizedPosition = positionFromSim ? posToObj(positionFromSim) : null
  const position = normalizedPosition || robot?.position || posToObj(robot?.telemetry?.position) || { x: 25, y: 25, z: 0 }

  const batteryFromSim = typeof simStatus?.battery === 'number' ? simStatus.battery : undefined
  const battery = Number.isFinite(Number(batteryFromSim))
    ? Number(batteryFromSim)
    : (typeof robot?.battery === 'number' ? robot.battery : 100)

  return {
    id: robot?.id || deviceNode || `robot_${index}`,
    device_node: deviceNode,
    name: robot?.name || deviceNode || ticker || 'UNKNOWN',
    ticker: ticker || '',
    type: robot?.type || robot?.sim_type || 'Unknown',
    status,
    position,
    battery,
    token: {
      symbol: ticker || 'TKN',
      price: resolveNumber(robot?.price, 0),
    },
    contractAddress,
    image,
    age: robot?.age ?? robot?.token_age ?? null,
    fdv: robot?.fdv ?? robot?.fully_diluted_valuation ?? null,
    change24h: robot?.change24h ?? robot?.change_24h ?? null,
    volume24h: robot?.volume24h ?? robot?.volume_24h ?? null,

    // Graduation status
    is_graduated: robot?.is_graduated ?? robot?.isGraduated ?? robot?.graduated ?? false,
    graduated_at: robot?.graduated_at ?? robot?.graduatedAt ?? null,
    uniswap_pool_address: robot?.uniswap_pool_address ?? robot?.uniswapPoolAddress ?? null,

    // Market data
    market_cap: robot?.market_cap ?? robot?.marketCap ?? 0,
    price: robot?.price ?? 0,
    target_eth: robot?.target_eth ?? robot?.targetEth ?? null,
    total_supply: robot?.total_supply ?? robot?.totalSupply ?? null,
    liquidity: robot?.liquidity ?? 0,

    // Trading stats (24h)
    volume_24h: robot?.volume_24h ?? robot?.volume24h ?? 0,
    txns_24h: robot?.txns_24h ?? robot?.txns24h ?? 0,
    buys_24h: robot?.buys_24h ?? robot?.buys24h ?? 0,
    buys_24h_volume: robot?.buys_24h_volume ?? robot?.buys24hVolume ?? 0,
    sells_24h: robot?.sells_24h ?? robot?.sells24h ?? 0,
    sells_24h_volume: robot?.sells_24h_volume ?? robot?.sells24hVolume ?? 0,
    net_buy_24h: robot?.net_buy_24h ?? robot?.netBuy24h ?? 0,

    // Price changes
    price_change_5m: robot?.price_change_5m ?? robot?.priceChange5m ?? 0,
    price_change_1h: robot?.price_change_1h ?? robot?.priceChange1h ?? 0,
    price_change_6h: robot?.price_change_6h ?? robot?.priceChange6h ?? 0,
    price_change_24h: robot?.price_change_24h ?? robot?.priceChange24h ?? 0,

    // Holders
    holders_count: robot?.holders_count ?? robot?.holdersCount ?? 0,

    // Timestamps
    timestamp: robot?.timestamp ?? robot?.created_at ?? null,
    created_at: robot?.created_at ?? robot?.timestamp ?? null,
    updated_at: robot?.updated_at ?? null,

    // DEX paid status
    dex_paid: robot?.dex_paid ?? false,

    command_list: Array.isArray(robot?.command_list) ? robot.command_list : [],
    simulations: Array.isArray(robot?.simulations)
      ? robot.simulations
          .filter((s) => {
            // Only include simulations that belong to the current wallet
            if (!wallet) return true // If no wallet provided, include all (for public view)
            const simWallet = (s?.wallet || '').toLowerCase()
            const currentWallet = (wallet || '').toLowerCase()
            return simWallet === currentWallet
          })
          .map((s) => {
            const dev = s.device_node || s.parent_device_node || deviceNode
            const normStatus = s.status ? { ...s.status, position: posToObj(s.status.position) } : undefined
            return { ...s, device_node: dev, status: normStatus }
          })
      : [],
    wallet: robot?.wallet || '',
    description: robot?.description || '',
    website: robot?.website || '',
    twitter: robot?.twitter || '',
    telegram: robot?.telegram || '',
    links: robot?.links || [],
    ownedSimulation: baseSimulation || null,
    activeSimulationId: baseSimulation?.simulation_id || null,
  }
}

export const normalizeRobots = (data, { wallet, userSimulationMap } = {}) => {
  const list = Array.isArray(data) ? data : Array.isArray(data?.robots) ? data.robots : []
  return list.map((robot, idx) => normalizeRobot(robot, idx, { wallet, userSimulationMap }))
}