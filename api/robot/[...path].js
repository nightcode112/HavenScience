/* eslint-env node */
const UPSTREAM_BASE = 'https://havenserver.com/robot'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, wallet',
  'Access-Control-Max-Age': '86400',
}

function applyCors(res) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value)
  }
}

function normalizePathParts(raw) {
  if (!raw) return []
  const parts = Array.isArray(raw) ? raw : [raw]
  return parts.filter((part) => typeof part === 'string' && part.length > 0)
}

function buildQueryString(query) {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key === 'path') continue
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v === undefined || v === null) continue
        params.append(key, String(v))
      }
    } else {
      params.append(key, String(value))
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function getRequestPayload(req) {
  const method = req.method || 'GET'
  if (method === 'GET' || method === 'HEAD') {
    return { body: undefined, parsed: null, inferredContentType: undefined }
  }

  if (typeof req.body !== 'undefined') {
    const existing = req.body
    if (Buffer.isBuffer(existing)) {
      if (existing.length === 0) {
        return { body: undefined, parsed: null, inferredContentType: undefined }
      }
      return { body: existing, parsed: null, inferredContentType: undefined }
    }
    if (typeof existing === 'string') {
      const text = existing
      if (!text) {
        return { body: undefined, parsed: null, inferredContentType: undefined }
      }
      try {
        const parsed = JSON.parse(text)
        return { body: text, parsed, inferredContentType: 'application/json' }
      } catch {
        return { body: text, parsed: null, inferredContentType: undefined }
      }
    }
    // Assume plain object that should be JSON serialised
    return { body: JSON.stringify(existing), parsed: existing, inferredContentType: 'application/json' }
  }

  const chunks = []
  const bodyBuffer = await new Promise((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', (err) => reject(err))
  })

  if (!bodyBuffer || bodyBuffer.length === 0) {
    return { body: undefined, parsed: null, inferredContentType: undefined }
  }

  const text = bodyBuffer.toString('utf8')
  if (!text) {
    return { body: bodyBuffer, parsed: null, inferredContentType: undefined }
  }

  try {
    const parsed = JSON.parse(text)
    return { body: text, parsed, inferredContentType: 'application/json' }
  } catch {
    return { body: bodyBuffer, parsed: null, inferredContentType: undefined }
  }
}

function sanitizeHeaders(headers, hasBody, fallbackContentType) {
  const clean = {}
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase()
      if (HOP_BY_HOP_HEADERS.has(lower)) continue
      if (typeof value === 'undefined') continue
      if (Array.isArray(value)) {
        clean[lower] = value.map((v) => String(v)).join(', ')
      } else {
        clean[lower] = String(value)
      }
    }
  }

  if (hasBody) {
    const hasContentTypeHeader = Object.keys(clean).some((key) => key.toLowerCase() === 'content-type')
    if (!hasContentTypeHeader && fallbackContentType) {
      // Use lowercase to avoid duplicate header names with different casing
      clean['content-type'] = fallbackContentType
    }
  }

  return clean
}

function encodePart(part) {
  return encodeURIComponent(part)
}

function buildUpstreamPath(pathParts, parsedBody) {
  if (!pathParts.length) return '/'

  if (pathParts.length === 2 && pathParts[0] === 'command' && pathParts[1] === 'add-command') {
    const commandValue = typeof parsedBody?.command === 'string' ? parsedBody.command.trim() : ''
    if (!commandValue) {
      return { error: { status: 400, message: 'Missing command value in request body' } }
    }
    return { path: `/${encodePart(commandValue)}/add-command` }
  }

  if (pathParts.length === 2 && pathParts[0] === 'command') {
    // Map /api/robot/command/<simulation_id> -> /robot/<simulation_id>/command
    return { path: `/${encodePart(pathParts[1])}/command` }
  }

  if (pathParts.length === 3 && pathParts[0] === 'status') {
    return { path: `/${encodePart(pathParts[1])}/${encodePart(pathParts[2])}/status` }
  }

  const encoded = pathParts.map((part) => encodePart(part)).join('/')
  return { path: `/${encoded}` }
}

export async function proxyRobot(req, res, overridePathParts = null) {
  if ((req.method || 'GET') === 'OPTIONS') {
    applyCors(res)
    return res.status(204).end()
  }

  let parsed = null
  let inferredContentType = undefined
  let bodyToSend = undefined
  try {
    const payload = await getRequestPayload(req)
    parsed = payload.parsed
    inferredContentType = payload.inferredContentType
    bodyToSend = payload.body
  } catch (err) {
    applyCors(res)
    return res.status(400).json({ error: 'Invalid request body', detail: String(err) })
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    bodyToSend = undefined
  } else if (typeof bodyToSend === 'string' && bodyToSend.length === 0) {
    bodyToSend = undefined
  } else if (Buffer.isBuffer(bodyToSend) && bodyToSend.length === 0) {
    bodyToSend = undefined
  }

  const pathParts = overridePathParts ?? normalizePathParts(req.query?.path)
  const { path: upstreamPath, error } = buildUpstreamPath(pathParts, parsed)

  if (error) {
    applyCors(res)
    return res.status(error.status || 400).json({ error: error.message })
  }

  // Filter dynamic params used by explicit route mappings out of the query string
  const filteredQuery = (() => {
    const q = { ...(req.query || {}) }
    delete q.path
    // When explicit override is used, remove route params so they don't leak to upstream
    if (overridePathParts && Array.isArray(overridePathParts) && overridePathParts.length) {
      const head = overridePathParts[0]
      if (head === 'command') {
        // /command/<simulation_id>
        delete q.simulation_id
      } else if (head === 'status') {
        // /status/<simulation_id>/<device_node>
        delete q.simulation_id
        delete q.device_node
      }
    }
    return q
  })()
  const queryString = buildQueryString(filteredQuery)
  const upstreamUrl = `${UPSTREAM_BASE}${upstreamPath}${queryString}`

  const headers = sanitizeHeaders(req.headers, typeof bodyToSend !== 'undefined', inferredContentType)
  // Ensure JSON accept header (normalized casing)
  headers['accept'] = headers['accept'] || 'application/json'
  // If upstream expects wallet header for some POSTs, inject from body when missing
  try {
    if (upstreamPath === '/sim/load-simulation') {
      const parsedBody = parsed || null
      const bodyWallet = parsedBody && typeof parsedBody.wallet === 'string' ? parsedBody.wallet : null
      if (!headers['wallet'] && bodyWallet) headers['wallet'] = bodyWallet
    }
  } catch {}

  try {
    // Mirror other endpoints: just forward method/headers/body
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: bodyToSend,
    })

    const arrayBuffer = await upstreamResponse.arrayBuffer().catch(() => null)
    const responseBuffer = arrayBuffer ? Buffer.from(arrayBuffer) : null

    // Avoid verbose logs; behave like other endpoints

    for (const [key, value] of upstreamResponse.headers.entries()) {
      const lower = key.toLowerCase()
      if (lower === 'transfer-encoding' || lower === 'content-length') continue
      res.setHeader(key, value)
    }

    applyCors(res)

    res.status(upstreamResponse.status)
    if ((req.method || 'GET') === 'HEAD') {
      res.end()
    } else {
      if (responseBuffer) {
        res.send(responseBuffer)
      } else {
        // Fallback: forward text
        const text = await upstreamResponse.text().catch(() => '')
        res.send(text)
      }
    }
  } catch (err) {
    applyCors(res)
    res.status(502).json({ error: 'Upstream error', detail: String(err) })
  }
}

export default async function handler(req, res) {
  return proxyRobot(req, res)
}

