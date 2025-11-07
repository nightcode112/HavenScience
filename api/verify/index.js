/* eslint-env node */

// Etherscan verification endpoint for ERC20s created by the Factory
// POST /api/verify
// Body: { tokenAddress, name, symbol, description, imageUrl, website, twitter, telegram }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v)
}

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'Y77IKMZ4FF473G6G7CMSETPU5R6CYGU1SB'
const ETHERSCAN_API_BASE = 'https://api-sepolia.etherscan.io/api'

// Build Standard JSON Input for solc from local sources
async function buildStandardJsonInput() {
  const fs = await import('fs')
  const path = await import('path')

  const baseDir = path.resolve(process.cwd(), 'haven-dashboard/src/contracts/code')
  const nodeModules = path.resolve(process.cwd(), 'haven-dashboard/node_modules')
  const factoryPath = path.join(baseDir, 'FullBondingCurveFactorySepoliaUSD.sol')
  const erc20Path = path.join(baseDir, 'FullBondingCurveERC20SepoliaUSD.sol')

  // Read root sources
  const sources = {}

  function addSource(key, content) {
    if (!sources[key]) sources[key] = { content }
  }

  function readFileSafe(p) {
    try {
      return fs.readFileSync(p, 'utf8')
    } catch {
      return ''
    }
  }

  function normPosix(p) {
    return p.split('\\').join('/')
  }

  function collectImports(fileKey, fileDiskPath, content, visited) {
    addSource(fileKey, content)
    if (visited.has(fileKey)) return
    visited.add(fileKey)
    const importRegex = /import\s+["']([^"']+)["'];/g
    let m
    while ((m = importRegex.exec(content)) !== null) {
      const spec = m[1]
      if (spec.startsWith('@openzeppelin/') || spec.startsWith('@chainlink/')) {
        const diskPath = path.join(nodeModules, spec)
        const depContent = readFileSafe(diskPath)
        if (depContent) collectImports(normPosix(spec), diskPath, depContent, visited)
      } else if (spec.endsWith('.sol')) {
        // local or relative import from current file key
        const baseDirname = path.dirname(fileKey)
        const nextKey = normPosix(path.join(baseDirname, spec))
        const resolvedDisk = path.isAbsolute(spec) ? spec : path.resolve(path.dirname(fileDiskPath), spec)
        const cont = readFileSafe(resolvedDisk)
        if (cont) collectImports(nextKey, resolvedDisk, cont, visited)
      }
    }
  }

  const factorySource = readFileSafe(factoryPath)
  const erc20Source = readFileSafe(erc20Path)
  const visited = new Set()
  // Add both plain and './' keys to match Remix-style paths
  collectImports('FullBondingCurveFactorySepoliaUSD.sol', factoryPath, factorySource, visited)
  collectImports('./FullBondingCurveFactorySepoliaUSD.sol', factoryPath, factorySource, visited)
  collectImports('contracts/code/FullBondingCurveFactorySepoliaUSD.sol', factoryPath, factorySource, visited)
  collectImports('src/contracts/code/FullBondingCurveFactorySepoliaUSD.sol', factoryPath, factorySource, visited)
  collectImports('haven-dashboard/src/contracts/code/FullBondingCurveFactorySepoliaUSD.sol', factoryPath, factorySource, visited)
  collectImports('FullBondingCurveERC20SepoliaUSD.sol', erc20Path, erc20Source, visited)
  collectImports('./FullBondingCurveERC20SepoliaUSD.sol', erc20Path, erc20Source, visited)
  collectImports('contracts/code/FullBondingCurveERC20SepoliaUSD.sol', erc20Path, erc20Source, visited)
  collectImports('src/contracts/code/FullBondingCurveERC20SepoliaUSD.sol', erc20Path, erc20Source, visited)
  collectImports('haven-dashboard/src/contracts/code/FullBondingCurveERC20SepoliaUSD.sol', erc20Path, erc20Source, visited)

  // Compiler settings must match deployment; tweak if needed
  const settings = {
    optimizer: { enabled: true, runs: 200 },
    metadata: { bytecodeHash: 'ipfs' },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'],
      },
    },
  }

  // We will return without compilerVersion; caller may override with on-chain detected version
  const pragmaMatch = /pragma solidity\s+\^?([0-9]+\.[0-9]+\.[0-9]+)/.exec(erc20Source)
  const inferred = pragmaMatch ? pragmaMatch[1] : '0.8.19'
  return { inferredSolc: inferred, standardJsonInput: { language: 'Solidity', sources, settings } }
}

async function encodeConstructorArgsHex(args) {
  // Encode as ABI hex (without 0x) using a light inline encoder for common types
  // name (string), symbol (string), descriptionHash (bytes32), imageHash (bytes32), socialHash (bytes32), creator (address), factory (address)
  // NOTE: Our on-chain constructor in code uses bytes32 hashes, but the create form uses strings/urls.
  // For Etherscan verification of the ERC20 implementation, we must pass EXACT constructor types.
  // Here we accept strings for description/image/social and convert to bytes32 as per factory logic (bytes32(bytes(str))).
  const viem = await import('viem')

  const [name, symbol, description, imageUrl, website, twitter, telegram, creator, factory] = args
  // Factory uses bytes32(bytes(str)) for description and image (right-padded/truncated)
  const toBytes32 = (s) => {
    const hex = viem.stringToHex(String(s))
    const no0x = hex.slice(2)
    const truncated = no0x.slice(0, 64)
    return '0x' + truncated.padEnd(64, '0')
  }
  const descriptionHash = toBytes32(description || '')
  const imageHash = toBytes32(imageUrl || '')
  const socialHash = viem.keccak256(viem.stringToHex(String((website || '') + (twitter || '') + (telegram || ''))))

  // Use viem to encode constructor args
  const abiParams = viem.parseAbiParameters('string _name, string _symbol, bytes32 _descriptionHash, bytes32 _imageHash, bytes32 _socialHash, address _creator, address _factory')
  const encoded = viem.encodeAbiParameters(abiParams, [name, symbol, descriptionHash, imageHash, socialHash, creator, factory])
  return encoded.slice(2)
}

async function postToEtherscan(payload) {
  const res = await fetch(ETHERSCAN_API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload),
  })
  const json = await res.json().catch(() => ({}))
  return json
}

async function detectCompilerFromCreationBytecode(tokenAddress) {
  try {
    const url = `${ETHERSCAN_API_BASE}?module=contract&action=getcontractcreation&contractaddresses=${tokenAddress}&apikey=${ETHERSCAN_API_KEY}`
    const res = await fetch(url)
    const js = await res.json()
    const bytecode = js?.result?.[0]?.creationBytecode || ''
    // Look for '64736f6c63430008XX' where XX is minor version hex (e.g., 1e -> 30)
    const idx = bytecode.lastIndexOf('64736f6c63430008')
    if (idx !== -1 && bytecode.length >= idx + 20) {
      const minorHex = bytecode.slice(idx + 18, idx + 20)
      const minor = parseInt(minorHex, 16)
      const full = `0.8.${isFinite(minor) ? minor : 19}`
      const commits = {
        '0.8.19': 'v0.8.19+commit.7dd6d404',
        '0.8.20': 'v0.8.20+commit.a1b79de6',
        '0.8.26': 'v0.8.26+commit.8a97fa7a',
        '0.8.30': 'v0.8.30+commit.73712a01',
      }
      return commits[full] || `v${full}+commit.89fef92a`
    }
  } catch {}
  return null
}

async function verifyOnEtherscan({ tokenAddress, constructorArgs, solcVersion, standardJsonInput }) {
  // 1) Submit verification (try several fully-qualified names)
  const candidateNames = [
    './FullBondingCurveERC20SepoliaUSD.sol:FullBondingCurveERC20SepoliaUSD1ETH',
    'FullBondingCurveERC20SepoliaUSD.sol:FullBondingCurveERC20SepoliaUSD1ETH',
    'src/contracts/code/FullBondingCurveERC20SepoliaUSD.sol:FullBondingCurveERC20SepoliaUSD1ETH',
    'contracts/code/FullBondingCurveERC20SepoliaUSD.sol:FullBondingCurveERC20SepoliaUSD1ETH',
    'haven-dashboard/src/contracts/code/FullBondingCurveERC20SepoliaUSD.sol:FullBondingCurveERC20SepoliaUSD1ETH',
    'FullBondingCurveERC20SepoliaUSD1ETH',
  ]
  let submit = null
  for (const contractname of candidateNames) {
    submit = await postToEtherscan({
      apikey: ETHERSCAN_API_KEY,
      module: 'contract',
      action: 'verifysourcecode',
      contractaddress: tokenAddress,
      codeformat: 'solidity-standard-json-input',
      sourceCode: JSON.stringify(standardJsonInput),
      contractname,
      compilerversion: solcVersion,
      constructorArguments: constructorArgs,
      licensetype: 3,
    })
    if (submit && submit.status === '1') break
  }

  if (!submit || submit.status !== '1') {
    return { ok: false, stage: 'submit', detail: submit, guid: submit?.result }
  }

  const guid = submit.result

  // 2) Poll status
  const started = Date.now()
  while (Date.now() - started < 180000) { // up to 3 minutes
    await new Promise((r) => setTimeout(r, 5000))
    const status = await postToEtherscan({
      apikey: ETHERSCAN_API_KEY,
      module: 'contract',
      action: 'checkverifystatus',
      guid,
    })
    if (status && status.status === '1') {
      return { ok: true, detail: status, guid }
    }
    if (status && status.status === '0' && /already verified/i.test(String(status.result))) {
      return { ok: true, detail: status, guid }
    }
  }
  return { ok: false, stage: 'poll', detail: { message: 'timeout' }, guid }
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }

export default async function handler(req, res) {
  if ((req.method || 'GET') === 'OPTIONS') {
    applyCors(res)
    return res.status(204).end()
  }
  if ((req.method || 'GET') !== 'POST') {
    applyCors(res)
    res.setHeader('Allow', 'POST, OPTIONS')
    return res.status(405).end('Method Not Allowed')
  }

  try {
    const { tokenAddress, name, symbol, description, imageUrl, website, twitter, telegram, creator, factory } = req.body || {}
    if (!tokenAddress || !name || !symbol || !creator || !factory) {
      applyCors(res)
      return res.status(400).json({ error: 'Missing required fields: tokenAddress, name, symbol, creator, factory' })
    }

    const { inferredSolc, standardJsonInput } = await buildStandardJsonInput()
    const constructorArgs = await encodeConstructorArgsHex([name, symbol, description, imageUrl, website, twitter, telegram, creator, factory])

    // Force Remix build version used by user (0.8.30+commit.73712a01)
    const solcVersion = 'v0.8.30+commit.73712a01'

    const result = await verifyOnEtherscan({ tokenAddress, constructorArgs, solcVersion, standardJsonInput })
    applyCors(res)
    if (!result.ok) return res.status(502).json({ error: 'Verification failed', ...result })
    return res.status(200).json({ success: true, ...result })
  } catch (err) {
    applyCors(res)
    return res.status(500).json({ error: 'Server error', detail: String(err) })
  }
}


