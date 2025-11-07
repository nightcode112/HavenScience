import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useToast } from '../components/Toast'
import { ArrowLeft, Upload, Bot, Image, Usb, Lock, Globe, MessageCircle, Twitter, ChevronDown, Plus, Link2 as LinkIcon, HelpCircle } from 'lucide-react'
import EnvironmentWizardModal from '../components/EnvironmentWizardModal'
import { Link, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useAccount } from 'wagmi'
import { CONTRACTS } from '../utils/contracts'
import { writeContract, waitForTransactionReceipt, simulateContract, readContract, readContracts } from '@wagmi/core'
import { config as wagmiConfig } from '../wagmi'
import { decodeEventLog, parseUnits, getCreate2Address, formatUnits } from 'viem'
import { readContract as viemRead } from '@wagmi/core'
import FactoryAbi from '../contracts/abis/FullBondingCurveFactoryXToken.json'
import { PageMeta } from '../components/PageMeta'
import { getSimTypeConfig, getGameSimConfig } from '../utils/api'

export function CreateBot() {
  const { addToast } = useToast()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { address, isConnected } = useAccount()
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    name: '',
    ticker: '',
    description: '',
    image: '',
    website: '',
    twitter: '',
    telegram: '',
    initialSupplyPercent: 80,
    sim_type: 'sim_type1',
    connection_type: 'simulation',
    initialBuyXToken: ''
  })
  const [isGlobal, setIsGlobal] = useState(true) // true = public, false = private

  const [dragActive, setDragActive] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [showSocial, setShowSocial] = useState(false)
  const [showConnection, setShowConnection] = useState(false)
  const [xTokenBalance, setXTokenBalance] = useState('0')
  const [xTokenDecimals, setXTokenDecimals] = useState(18)
  const [showEnv, setShowEnv] = useState(false)
  const [envLoading, setEnvLoading] = useState(false)
  const [simTypeOptions, setSimTypeOptions] = useState({})
  const [gameSimOptions, setGameSimOptions] = useState({})
  const [showSimDetails, setShowSimDetails] = useState(false)
  const [showGameDetails, setShowGameDetails] = useState(false)
  const [openEnvWizard, setOpenEnvWizard] = useState(false)
  const [showMyEnvs, setShowMyEnvs] = useState(false)
  const [myEnvsLoading, setMyEnvsLoading] = useState(false)
  const [myEnvs, setMyEnvs] = useState([])
  const [editModal, setEditModal] = useState({ open: false, target: null, id: '', config: null })
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [advDetailed, setAdvDetailed] = useState('')
  const [advHowItWorks, setAdvHowItWorks] = useState('')
  const [advRoadmap, setAdvRoadmap] = useState('')
  const [advAboutTeam, setAdvAboutTeam] = useState('')
  const [selectedBrain, setSelectedBrain] = useState('')
  const [brainOptions, setBrainOptions] = useState([])
  const [brainLoading, setBrainLoading] = useState(false)

  const ROBOT_API_BASE = '/api'
  const apiFetch = (path, init) => fetch(`${ROBOT_API_BASE}${path}`, init)

  // On-chain assisted vanity mining using getInitCodeHashForParams
  const mineVanitySalt = async (
    factoryAddress,
    { name, symbol, description, imageUrl, website, twitter, telegram, creator }
  ) => {
    // 1) Get initCodeHash from Factory for these params
    const initCodeHash = await readContract(wagmiConfig, {
      abi: CONTRACTS.factory.abi,
      address: factoryAddress,
      functionName: 'getInitCodeHashForParams',
      args: [name, symbol, description, imageUrl, website, twitter, telegram, creator],
    })

    const targetSuffix = '4242'
    let attempts = 0
    while (true) {
      attempts++
      const randomBytes = new Uint8Array(32)
      crypto.getRandomValues(randomBytes)
      const salt = '0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')
      const predictedAddress = getCreate2Address({ from: factoryAddress, salt, bytecodeHash: initCodeHash })
      if (predictedAddress.toLowerCase().endsWith(targetSuffix)) {
        // eslint-disable-next-line no-console
        console.log('[VanityMiner] Found!', { salt, predictedAddress, attempts })
        return { salt, predictedAddress }
      }
      if (attempts % 1000 === 0) await new Promise(r => setTimeout(r, 0))
    }
  }
  // Compress a dataURL to webp with max dimension to reduce payload size
  const compressDataUrl = (dataUrl, { maxDim = 1024, quality = 0.82 } = {}) => new Promise((resolve) => {
    try {
      if (!dataUrl?.startsWith('data:image')) return resolve(dataUrl)
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const { width, height } = img
        const scale = Math.min(1, maxDim / Math.max(width, height))
        const w = Math.max(1, Math.round(width * scale))
        const h = Math.max(1, Math.round(height * scale))
        canvas.width = w
        canvas.height = h
        ctx.drawImage(img, 0, 0, w, h)
        const out = canvas.toDataURL('image/webp', quality)
        resolve(out || dataUrl)
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    } catch {
      resolve(dataUrl)
    }
  })


  const handleInputChange = (e) => {
    const { name, value } = e.target

    // Validaciones específicas
    if (name === 'ticker') {
      // Solo mayúsculas y máximo 12 caracteres
      const upperValue = value.toUpperCase().slice(0, 12)
      setFormData(prev => ({ ...prev, [name]: upperValue }))
    } else if (name === 'name') {
      // Máximo 30 caracteres para el nombre
      const limitedValue = value.slice(0, 30)
      setFormData(prev => ({ ...prev, [name]: limitedValue }))
    } else if (name === 'description') {
      // Máximo 200 caracteres para la descripción
      const limitedValue = value.slice(0, 200)
      setFormData(prev => ({ ...prev, [name]: limitedValue }))
    } else if (name === 'initialSupplyPercent') {
      const parsed = Number(value)
      const clamped = Number.isFinite(parsed) ? Math.min(90, Math.max(70, Math.floor(parsed))) : 80
      setFormData(prev => ({ ...prev, [name]: clamped }))
  } else if (name === 'initialBuyXToken') {
    // Replace dot with comma for decimal separator (European format)
    const normalizedValue = value.replace('.', ',')
    // Only allow numbers and one comma
    if (normalizedValue === '' || /^\d*,?\d*$/.test(normalizedValue)) {
      setFormData(prev => ({ ...prev, [name]: normalizedValue }))
    }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Create preview
      const reader = new FileReader()
      reader.onload = async (e) => {
        const dataUrl = e.target.result
        setImagePreview(dataUrl)
        // Try to compress and upload immediately to IPFS
        setIsUploadingImage(true)
        addToast('Uploading image to IPFS...', 'info', 30000)
        try {
          const compressed = await compressDataUrl(dataUrl)
          const up = await fetch('/api/ipfs/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: compressed, name: `${(formData.ticker || 'robot')}.webp` })
          })
          const upJson = await up.json().catch(() => null)
          setIsUploadingImage(false)
          if (up.ok && (upJson?.protocolUrl || upJson?.url)) {
            const url = upJson.protocolUrl || upJson.url
            setFormData(prev => ({ ...prev, image: url }))
            addToast('Image uploaded successfully!', 'success')
          } else {
            setFormData(prev => ({ ...prev, image: dataUrl }))
            addToast('Image upload failed. Will retry on submit.', 'warning')
          }
        } catch {
          setIsUploadingImage(false)
          setFormData(prev => ({ ...prev, image: dataUrl }))
          addToast('Image upload failed. Will retry on submit.', 'warning')
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]

      const reader = new FileReader()
      reader.onload = async (e) => {
        const dataUrl = e.target.result
        setImagePreview(dataUrl)
        setIsUploadingImage(true)
        addToast('Uploading image to IPFS...', 'info', 30000)
        try {
          const compressed = await compressDataUrl(dataUrl)
          const up = await fetch('/api/ipfs/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: compressed, name: `${(formData.ticker || 'robot')}.webp` })
          })
          const upJson = await up.json().catch(() => null)
          setIsUploadingImage(false)
          if (up.ok && (upJson?.protocolUrl || upJson?.url)) {
            const url = upJson.protocolUrl || upJson.url
            setFormData(prev => ({ ...prev, image: url }))
            addToast('Image uploaded successfully!', 'success')
          } else {
            setFormData(prev => ({ ...prev, image: dataUrl }))
            addToast('Image upload failed. Will retry on submit.', 'warning')
          }
        } catch {
          setIsUploadingImage(false)
          setFormData(prev => ({ ...prev, image: dataUrl }))
          addToast('Image upload failed. Will retry on submit.', 'warning')
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isConnected || !address) {
      addToast('Please connect your wallet to create a robot', 'warning')
      return
    }

    // Validaciones
    if (!formData.name.trim()) {
      addToast('Please enter a robot name', 'warning')
      return
    }

    if (!formData.ticker.trim()) {
      addToast('Please enter a token ticker', 'warning')
      return
    }

    if (formData.ticker.length < 2) {
      addToast('Ticker must be at least 2 characters', 'warning')
      return
    }

    if (!formData.description.trim()) {
      addToast('Please enter a description', 'warning')
      return
    }

    if (!formData.image) {
      addToast('Please upload a robot image', 'warning')
      return
    }

    // Advanced options validation (optional but with minimums if provided)
    const det = advDetailed.trim()
    const how = advHowItWorks.trim()
    const road = advRoadmap.trim()
    const team = advAboutTeam.trim()
    const hasAdvanced = det.length > 0 || how.length > 0 || road.length > 0 || team.length > 0
    if (hasAdvanced) {
      if (det && det.length < 300) { addToast('Detailed Description must be at least 300 characters', 'warning'); return }
      if (how && how.length < 300) { addToast('How it works must be at least 300 characters', 'warning'); return }
      if (road && road.length < 150) { addToast('Roadmap must be at least 150 characters', 'warning'); return }
      if (team && team.length < 200) { addToast('About Team must be at least 200 characters', 'warning'); return }
    }

    // Basic on-chain constraints pre-validation to avoid silent reverts
    const nameTrimmed = String(formData.name || '').trim()
    const symbolTrimmed = String(formData.ticker || '').trim()
    if (nameTrimmed.length === 0 || nameTrimmed.length > 50) {
      addToast('Name must be between 1 and 50 characters', 'warning')
      return
    }
    if (symbolTrimmed.length === 0 || symbolTrimmed.length > 10) {
      addToast('Symbol must be between 1 and 10 characters', 'warning')
      return
    }

    setIsSubmitting(true)

    try {
      // 1) Ensure image URL is IPFS/HTTP; if dataURL, compress+upload once
      let imageUrl = formData.image
      const isUrl = typeof imageUrl === 'string' && (imageUrl.startsWith('ipfs://') || imageUrl.startsWith('http'))
      
      if (!isUrl) {
        setIsUploadingImage(true)
        addToast('Uploading image to IPFS...', 'info', 30000)
        const compressedDataUrl = await compressDataUrl(formData.image)
        imageUrl = compressedDataUrl
        try {
          const up = await fetch(`/api/ipfs/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: compressedDataUrl, name: `${formData.ticker || 'robot'}.webp` }) })
          const upJson = await up.json().catch(() => null)
          if (up.ok && (upJson?.protocolUrl || upJson?.url)) imageUrl = upJson.protocolUrl || upJson.url
        } catch {}

        setIsUploadingImage(false)
        if (!imageUrl || (!String(imageUrl).startsWith('ipfs://') && !String(imageUrl).startsWith('http')) ) {
          addToast('Image upload failed.', 'error')
          setIsSubmitting(false)
          return
        }
        addToast('Image uploaded successfully!', 'success')
      }

  // v2 uses X Token as the quote asset. For now, default initial buy to 0.
  // Parse initial HAVEN amount (optional)
      const initialBuyXToken = formData.initialBuyXToken?.trim()
      let xTokenAmount = 0n
      if (initialBuyXToken && initialBuyXToken !== '') {
        const normalized = initialBuyXToken.replace(',', '.')
        const num = parseFloat(normalized)
        if (!Number.isFinite(num) || num < 0) {
          addToast(`Invalid initial HAVEN amount: "${initialBuyXToken}"`, 'warning')
          setIsSubmitting(false)
          return
        }
        try {
          const rounded = Math.floor(num * 1e6) / 1e6
          xTokenAmount = parseUnits(rounded.toFixed(6), xTokenDecimals)
        } catch (err) {
          addToast(`Failed to parse HAVEN amount: ${err.message}`, 'warning')
          setIsSubmitting(false)
          return
        }
      }

      // 2) Mine vanity salt for address ending in '4242' using initCode with constructor args
      addToast('Finding vanity address (ending in 4242)...', 'info', 30000)
      const { salt, predictedAddress: predictedFromServer } = await mineVanitySalt(CONTRACTS.factory.address, {
        name: nameTrimmed,
        symbol: symbolTrimmed,
        description: formData.description,
        imageUrl: imageUrl || '',
        website: formData.website || '',
        twitter: formData.twitter || '',
        telegram: formData.telegram || '',
        creator: address,
      })
      // eslint-disable-next-line no-console
      console.log('[CreateBot] Predicted CREATE2 address (on-chain assisted)', { salt, predictedFromServer })
      addToast('Vanity address found! Creating token...', 'success')

      // 2a) Ensure you have enough HAVEN balance for the initial buy (using Factory's configured X_TOKEN_ADDRESS)
      if (xTokenAmount > 0n) {
        try {
          const erc20BalAbi = [
            { "type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"account","type":"address"}],"outputs":[{"name":"","type":"uint256"}] },
            { "type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"uint8"}] }
          ]
          let factoryXToken = CONTRACTS.xtoken.address
          try {
            const chainX = await readContract(wagmiConfig, { abi: CONTRACTS.factory.abi, address: CONTRACTS.factory.address, functionName: 'X_TOKEN_ADDRESS' })
            if (typeof chainX === 'string' && chainX.length === 42) factoryXToken = chainX
          } catch {}
          const [rawDec, rawBal] = await Promise.all([
            readContract(wagmiConfig, { abi: erc20BalAbi, address: factoryXToken, functionName: 'decimals' }).catch(() => xTokenDecimals),
            readContract(wagmiConfig, { abi: erc20BalAbi, address: factoryXToken, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
          ])
          const useDec = Number(rawDec ?? xTokenDecimals) || xTokenDecimals
          if (BigInt(rawBal || 0n) < xTokenAmount) {
            addToast(`Insufficient HAVEN balance (${formatUnits(BigInt(rawBal||0n), useDec)} < ${formatUnits(xTokenAmount, useDec)})`, 'error')
            setIsSubmitting(false)
            return
          }
        } catch {
          addToast('Failed to read HAVEN balance', 'error')
          setIsSubmitting(false)
          return
        }
      }

      // 2b) Ensure HAVEN allowance if making an initial buy (spender = Factory)
      if (xTokenAmount > 0n) {
        try {
          const erc20ApproveAbi = [
            { "type":"function","name":"allowance","stateMutability":"view","inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"outputs":[{"name":"","type":"uint256"}] },
            { "type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}] }
          ]
          let factoryXToken = CONTRACTS.xtoken.address
          try {
            const chainX = await readContract(wagmiConfig, { abi: CONTRACTS.factory.abi, address: CONTRACTS.factory.address, functionName: 'X_TOKEN_ADDRESS' })
            if (typeof chainX === 'string' && chainX.length === 42) factoryXToken = chainX
          } catch {}
          const currentAllowance = await readContract(wagmiConfig, {
            abi: erc20ApproveAbi,
            address: factoryXToken,
            functionName: 'allowance',
            args: [address, CONTRACTS.factory.address],
          }).catch(() => 0n)
          if (currentAllowance < xTokenAmount) {
            addToast('Approving HAVEN for factory (infinite)...', 'info', 30000)
            const maxUint = (2n ** 256n) - 1n
            const approveHash = await writeContract(wagmiConfig, {
              abi: erc20ApproveAbi,
              address: factoryXToken,
              functionName: 'approve',
              args: [CONTRACTS.factory.address, maxUint],
            })
            await waitForTransactionReceipt(wagmiConfig, { hash: approveHash })
            addToast('HAVEN approved (infinite).', 'success')
          }
        } catch (err) {
          addToast('Approve failed. Please try again.', 'error')
          setIsSubmitting(false)
          throw err
        }
      }

      // 3) Call factory to create token with vanity salt (always 8 params)
      // Simulate to get the expected return address, then send tx and confirm via event
      let sim
      try {
        // eslint-disable-next-line no-console
        console.log('[CreateBot] Calling simulateContract with salt:', salt)
        
        sim = await simulateContract(wagmiConfig, {
          abi: CONTRACTS.factory.abi,
          address: CONTRACTS.factory.address,
          functionName: 'createToken',
          args: [
            nameTrimmed,
            symbolTrimmed,
            formData.description,
            imageUrl || '',
            formData.website || '',
            formData.twitter || '',
            formData.telegram || '',
            xTokenAmount,
            salt,
          ],
        })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[CreateBot] simulateContract error:', err)
        const msg = err?.shortMessage || err?.message || 'Simulation failed (possible invalid params or paused factory)'
        addToast(msg, 'error')
        setIsSubmitting(false)
        throw err
      }

      const txHash = await writeContract(wagmiConfig, sim.request).catch((err) => {
        const msg = err?.shortMessage || err?.message || 'Transaction failed'
        addToast(msg, 'error')
        setIsSubmitting(false)
        throw err
      })
      // Show long-running toast only after user confirmed in wallet
      addToast('Deploying robot contract... This can take a minute.', 'info', 30000)
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: txHash }).catch((err) => {
        addToast('Failed waiting for receipt', 'error')
        setIsSubmitting(false)
        throw err
      })

      // 1) Try simulated result
      let tokenAddress = sim?.result

      // 2) Parse TokenCreated event as source of truth
      try {
        for (const log of receipt.logs || []) {
          const decoded = decodeEventLog({ abi: FactoryAbi, data: log.data, topics: log.topics })
          if (decoded?.eventName === 'TokenCreated') {
            tokenAddress = decoded?.args?.tokenAddress || tokenAddress
            break
          }
        }
      } catch {}

      const payload = {
        is_advanced: hasAdvanced,
        is_global: isGlobal,
        wallet: address,
        sim_type: formData.sim_type,
        gamerules: formData.gamerules,
        name: formData.name,
        ticker: formData.ticker,
        description: formData.description || '',
        image: imageUrl || '',
        website: formData.website || '',
        twitter: formData.twitter || '',
        telegram: formData.telegram || '',
        contract: '0x0000000000000000000000000000000000000000',
        bonding_contract: tokenAddress || '',
        brain_id: selectedBrain || undefined
      }

      if (hasAdvanced) {
        const project_info = {}
        if (det) project_info['Detailed Description'] = det
        if (how) project_info['How it works'] = how
        if (road) project_info['Roadmap'] = road
        if (team) project_info['About Team'] = team
        payload.project_info = project_info
      }

      // Same-origin via proxy (/api) para dev y serverless en prod
      const response = await fetch(`${ROBOT_API_BASE}/robot/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', wallet: address },
        body: JSON.stringify(payload)
      })

      let result
      try {
        result = await response.json()
      } catch {
        result = { error: 'Invalid JSON response' }
      }

      if (response.ok) {
        addToast('Robot created successfully!', 'success')
        // Limpiar formulario
        setFormData({
          name: '',
          ticker: '',
          description: '',
          image: '',
          website: '',
          twitter: '',
          telegram: '',
          initialSupplyPercent: 80,
          sim_type: 'sim_type1',
          connection_type: 'simulation'
        })
        setAdvDetailed('')
        setAdvHowItWorks('')
        setAdvRoadmap('')
        setAdvAboutTeam('')
        setImagePreview(null)
        // Redirect to My Robots
        navigate('/robots')
      } else {
        addToast(`Error: ${result.error || 'Failed to create robot'}`, 'error')
      }
    } catch (error) {
      addToast('Network error. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const robotTypes = [
    { value: 'sim_type1', label: 'Sim Type 1' },
    { value: 'sim_type2', label: 'Sim Type 2' },
    { value: 'sim_type3', label: 'Sim Type 3' }
  ]

  const loadBrainOptions = async () => {
    if (!address) {
      return
    }
    setBrainLoading(true)
    try {
      const response = await fetch(`${ROBOT_API_BASE}/robot/brain-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_wallet: address })
      })

      const responseText = await response.text()
      let data
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        setBrainOptions([])
        return
      }

      // Handle different response formats
      let options = []
      if (data.option_list && Array.isArray(data.option_list)) {
        options = data.option_list
      } else if (typeof data === 'object' && !Array.isArray(data)) {
        options = Object.values(data).filter(option => option !== null && option !== undefined)
      } else if (Array.isArray(data)) {
        options = data.filter(option => option !== null && option !== undefined)
      }

      if (options.length > 0) {
        setBrainOptions(options)
      } else {
        setBrainOptions([])
      }
    } catch (error) {
      setBrainOptions([])
    } finally {
      setBrainLoading(false)
    }
  }

  const loadEnvironmentOptions = async () => {
    if (envLoading) return
    setEnvLoading(true)
    try {
      const [simsRes, gamesRes] = await Promise.all([
        apiFetch(`/robot/robots/default-sims`).then(r => r.json()).catch(() => null),
        apiFetch(`/robot/robots/default-gamesims`).then(r => r.json()).catch(() => null),
      ])
      // Accept multiple possible shapes from backend
      const resolveMap = (obj) => {
        if (!obj || typeof obj !== 'object') return {}
  return (
          obj.default_sim_types ||
          obj.default_sims ||
          obj.sim_types ||
          obj.default_game_sims ||
          obj.default_gamesims ||
          obj.game_sims ||
          obj
        ) || {}
      }
      const simMap = resolveMap(simsRes)
      const gameMap = resolveMap(gamesRes)
      setSimTypeOptions(simMap || {})
      setGameSimOptions(gameMap || {})
      const simKeys = Object.keys(simMap || {})
      const gameKeys = Object.keys(gameMap || {})
      const firstSimKey = simKeys[0]
      const firstGameKey = gameKeys[0]
      setFormData(prev => {
        const nextSim = simKeys.includes(prev.sim_type) ? prev.sim_type : (firstSimKey || '')
        const nextGame = gameKeys.includes(prev.gamerules) ? prev.gamerules : (firstGameKey || '')
        return { ...prev, sim_type: nextSim, gamerules: nextGame }
      })
      if ((!simMap || !Object.keys(simMap).length) || (!gameMap || !Object.keys(gameMap).length)) {
        addToast('No environment defaults found', 'warning')
      }
    } finally {
      setEnvLoading(false)
    }
  }

  useEffect(() => {
    loadEnvironmentOptions()
    // eslint-disable-next-line react-hooks-exhaustive-deps
  }, [])

  // Load sim type details when selected
  useEffect(() => {
    if (!formData.sim_type) return
    if (simTypeOptions[formData.sim_type] && Object.keys(simTypeOptions[formData.sim_type]).length > 0) return
    
    const loadDetails = async () => {
      try {
        const cfg = await getSimTypeConfig(formData.sim_type)
        if (cfg) {
          setSimTypeOptions(prev => ({ ...prev, [formData.sim_type]: cfg }))
        }
      } catch {
        // Silently fail
      }
    }
    loadDetails()
  }, [formData.sim_type])

  // Load game rules details when selected
  useEffect(() => {
    if (!formData.gamerules) return
    if (gameSimOptions[formData.gamerules] && Object.keys(gameSimOptions[formData.gamerules]).length > 0) return
    
    const loadDetails = async () => {
      try {
        const cfg = await getGameSimConfig(formData.gamerules)
        if (cfg) {
          setGameSimOptions(prev => ({ ...prev, [formData.gamerules]: cfg }))
        }
      } catch {
        // Silently fail
      }
    }
    loadDetails()
  }, [formData.gamerules])

  // Load brain options when wallet connects
  useEffect(() => {
    if (address && isConnected) {
      loadBrainOptions()
    }
    // eslint-disable-next-line react-hooks-exhaustive-deps
  }, [address, isConnected])

  // Load XTOKEN balance when wallet connected
  useEffect(() => {
    const load = async () => {
      try {
        if (!isConnected || !address) { setXTokenBalance('0'); return }
        const erc20Abi = [
          { "type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"uint8"}] },
          { "type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"account","type":"address"}],"outputs":[{"name":"","type":"uint256"}] }
        ]
        const results = await readContracts(wagmiConfig, {
          contracts: [
            { abi: erc20Abi, address: CONTRACTS.xtoken.address, functionName: 'decimals' },
            { abi: erc20Abi, address: CONTRACTS.xtoken.address, functionName: 'balanceOf', args: [address] },
          ]
        }).catch(() => null)
        const decimals = Number(results?.[0]?.result ?? 18)
        const bal = BigInt(results?.[1]?.result ?? 0n)
        setXTokenBalance(formatUnits(bal, decimals))
        setXTokenDecimals(Number.isFinite(decimals) ? decimals : 18)
      } catch { setXTokenBalance('0') }
    }
    load()
  }, [isConnected, address])

  const loadMyCustomEnvs = async () => {
    if (!address) {
      addToast('Please connect your wallet to view your environments', 'warning')
      return
    }
    setMyEnvsLoading(true)
    try {
      const res = await apiFetch(`/robot/robots/${address}`)
      const json = await res.json().catch(() => null)
      const list = Array.isArray(json?.robots) ? json.robots : []
      // Produce independent lists for sim types and game rules (they can mix)
      const simSet = new Set()
      const gameSet = new Set()
      for (const env of list) {
        const s = env?.sim_type || env?.simType || env?.sim_type_id || env?.simTypeId || ''
        const g = env?.game_sim_id || env?.gamerules || env?.gameRules || env?.gameSimId || ''
        if (s) simSet.add(s)
        if (g) gameSet.add(g)
      }
      setMyEnvs({ simTypes: Array.from(simSet), gameSims: Array.from(gameSet) })
      setShowMyEnvs(true)
    } catch {
      addToast('Failed to load your environments', 'error')
    } finally {
      setMyEnvsLoading(false)
    }
  }

  return (
    <>
      <PageMeta 
        title="Create Robot - HAVEN"
        description="Create your own digital twin robot on HAVEN. Deploy your robot with custom configurations and start trading on the bonding curve marketplace."
        url="https://haven-base.vercel.app/create"
      />
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center space-x-4 mb-8">
        <Link
          to="/"
          className={`p-2 rounded-lg transition-colors ${
            isDark ? 'hover:bg-slate-800/60 text-slate-400' : 'hover:bg-gray-100 text-gray-600'
          }`}
        >
          <ArrowLeft className={`h-5 w-5 ${isDark ? 'text-slate-400' : 'text-gray-600'} hover:text-[#5854f4]`} />
        </Link>
        <div>
          <h1 className={`text-3xl md:text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Create New Robot
          </h1>
          <p className={`text-lg ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
            Deploy your digital twin robot to the marketplace
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Form */}
        <div className="space-y-6">

          {/* Basic Information */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} shadow-lg`}>
            <CardHeader>
              <CardTitle className={`flex items-center space-x-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <Bot className={`h-5 w-5 ${isDark ? 'text-slate-400' : 'text-[#5854f4]'}`} />
                <span>Basic Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Name */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Robot Name ({formData.name.length}/30)
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Industrial Arm Alpha"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] shadow-sm ${
                    isDark
                      ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>

              {/* Ticker */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Token Ticker ({formData.ticker.length}/12)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="ticker"
                    value={formData.ticker}
                    onChange={handleInputChange}
                    placeholder="ROBOT"
                    className={`w-full px-3 py-2 border rounded-lg uppercase shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${
                      isDark
                        ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>
              </div>

              {/* Robot Type removed as per request */}

              {/* Description */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Description ({formData.description.length}/200)
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Describe your robot's capabilities and use cases..."
                  rows={4}
                  className={`w-full px-3 py-2 border rounded-lg resize-none shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${
                    isDark
                      ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>

              {/* Robot Visibility Toggle */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Robot Visibility
                  </label>
                  <div className="relative group">
                    <HelpCircle className={`h-4 w-4 ${isDark ? 'text-slate-400' : 'text-gray-500'} cursor-help`} />
                    <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-lg text-xs w-64 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 ${isDark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-white text-gray-700 border border-gray-200 shadow-lg'}`}>
                      Public: all users access the same simulation. Private: each user gets their own simulation.
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsGlobal(true)}
                    className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all ${
                      isGlobal
                        ? 'border-[#5854f4] bg-[#5854f4]/10 text-[#5854f4] font-medium'
                        : isDark
                          ? 'border-slate-600 text-slate-400 hover:border-slate-500'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span className="text-sm font-medium">Public</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsGlobal(false)}
                    className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all ${
                      !isGlobal
                        ? 'border-[#5854f4] bg-[#5854f4]/10 text-[#5854f4] font-medium'
                        : isDark
                          ? 'border-slate-600 text-slate-400 hover:border-slate-500'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span className="text-sm font-medium">Private</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Initial Buy Amount (Optional) */}
              <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Initial HAVEN Buy (Optional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="initialBuyXToken"
                    value={formData.initialBuyXToken}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className={`w-full px-3 py-2 pr-28 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] shadow-sm ${
                      isDark
                        ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    HAVEN bal: {(() => {
                      const num = parseFloat(xTokenBalance)
                      if (!Number.isFinite(num)) return '0'
                      if (num >= 1_000_000) return `${Math.round(num/1_000_000)}M`
                      if (num >= 1_000) return `${Math.round(num/1_000)}k`
                      return `${Math.round(num*1000)/1000}`
                    })()}
                  </span>
                </div>
                
                <div className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                  Max initial buy: 400 HAVEN
                </div>
              </div>

            </CardContent>
          </Card>

        {/* Advanced Options (Optional) */}
        <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} shadow-lg`}>
          <CardHeader>
            <CardTitle className={`flex items-center justify-between ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <span>Advanced Options <span className={`ml-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>(Optional)</span></span>
              <Button type="button" variant="ghost" onClick={() => setShowAdvancedOptions(v => !v)} className={`${isDark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-700 hover:bg-gray-100'} h-8 px-2`}>
                <ChevronDown className={`h-4 w-4 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className={`${showAdvancedOptions ? 'space-y-4' : 'hidden'} transition-all`}>
            {/* Detailed Description */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                Detailed Description (min 300 chars)
                  </label>
              <textarea
                value={advDetailed}
                onChange={(e) => setAdvDetailed(e.target.value)}
                rows={5}
                placeholder="Longer, detailed project description..."
                className={`w-full px-3 py-2 border rounded-lg resize-none shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
              />
              <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{advDetailed.length}/300</div>
                </div>

            {/* How it works */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                How it works (min 300 chars)
              </label>
              <textarea
                value={advHowItWorks}
                onChange={(e) => setAdvHowItWorks(e.target.value)}
                rows={5}
                placeholder="Explain how it works..."
                className={`w-full px-3 py-2 border rounded-lg resize-none shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
              />
              <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{advHowItWorks.length}/300</div>
            </div>

            {/* Roadmap */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                Roadmap (min 150 chars)
              </label>
              <textarea
                value={advRoadmap}
                onChange={(e) => setAdvRoadmap(e.target.value)}
                rows={4}
                placeholder="Outline phases and milestones..."
                className={`w-full px-3 py-2 border rounded-lg resize-none shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
              />
              <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{advRoadmap.length}/150</div>
            </div>

            {/* About Team */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                About Team (min 200 chars)
              </label>
              <textarea
                value={advAboutTeam}
                onChange={(e) => setAdvAboutTeam(e.target.value)}
                rows={4}
                placeholder="Tell users about the team..."
                className={`w-full px-3 py-2 border rounded-lg resize-none shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
              />
              <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{advAboutTeam.length}/200</div>
            </div>
          </CardContent>
        </Card>

          {/* Environment (collapsible) */}
          <Card className={`${isDark ? 'bg-slate-900/70 border border-slate-700/60 shadow-2xl' : 'bg-white/80 border border-gray-200 backdrop-blur-md shadow-2xl'}`}>
            <CardHeader>
              <CardTitle className={`flex items-center justify-between ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <span className="flex items-center"><Globe className={`h-5 w-5 mr-2 ${isDark ? 'text-slate-400' : 'text-[#5854f4]'}`} /> Environment</span>
                <Button type="button" variant="ghost" onClick={() => { setShowEnv(v => !v); if (!showEnv) loadEnvironmentOptions() }} className={`${isDark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-700 hover:bg-gray-100'} h-8 px-2`}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showEnv ? 'rotate-180' : ''}`} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className={`${showEnv ? 'space-y-4' : 'hidden'} transition-all`}>
              {/* Brain/Model select */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    AI Brain (Optional)
                  </label>
                  <div className="relative group">
                    <HelpCircle className={`h-4 w-4 ${isDark ? 'text-slate-400' : 'text-gray-500'} cursor-help`} />
                    <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-lg text-xs w-64 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 ${isDark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-white text-gray-700 border border-gray-200 shadow-lg'}`}>
                      Select an AI model to power your robot's intelligence. Leave empty for standard simulation.
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <select
                    value={selectedBrain}
                    onChange={(e) => setSelectedBrain(e.target.value)}
                    disabled={brainLoading || brainOptions.length === 0}
                    className={`w-full appearance-none pr-10 px-3 py-2 border rounded-lg cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  >
                    <option value="" className={isDark ? 'bg-slate-800' : 'bg-white'}>
                      {brainLoading ? 'Loading models...' : brainOptions.length === 0 ? 'No models available' : 'None (Standard Simulation)'}
                    </option>
                    {brainOptions.map((brain, index) => {
                      const [provider, model] = brain.split('/')
                      const displayName = model
                        ? `${provider.charAt(0).toUpperCase() + provider.slice(1)} - ${model}`
                        : brain
                      return (
                        <option
                          key={index}
                          value={brain}
                          className={isDark ? 'bg-slate-800' : 'bg-white'}
                        >
                          {displayName}
                        </option>
                      )
                    })}
                  </select>
                  <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                </div>
                {selectedBrain && (
                  <div className={`text-xs ${isDark ? 'bg-slate-800/40 text-slate-400' : 'bg-gray-50 text-gray-600'} p-2 rounded-lg`}>
                    <span className="font-semibold text-[#5854f4]">Selected:</span> {selectedBrain}
                  </div>
                )}
              </div>

              {/* Sim Type select */}
              <div className="space-y-2">
                <label className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Sim Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
                  <div className="relative w-full max-w-md">
                    <select
                    name="sim_type"
                    value={formData.sim_type}
                    onChange={handleInputChange}
                    className={`w-full appearance-none pr-10 px-3 py-2 border rounded-lg cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                    disabled={envLoading}
                  >
                    {Object.keys(simTypeOptions).map(key => (
                      <option key={key} value={key} className={isDark ? 'bg-slate-800' : 'bg-white'}>{key}</option>
                    ))}
                    </select>
                    <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                  </div>
                  <Button type="button" variant="outline" onClick={() => setShowSimDetails(s => !s)} className={`${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} h-9 px-3 justify-self-start sm:justify-self-auto`}>
                    {showSimDetails ? 'Hide details' : 'Show details'}
                  </Button>
                </div>
                {(() => {
                  const cfg = simTypeOptions[formData.sim_type] || {}
                  const commands = Array.isArray(cfg.command_list) ? cfg.command_list.length : 0
                  const status = cfg.status || {}
                  const size = Array.isArray(status.size) ? status.size.join('×') : '—'
                  const sensorsCount = status.sensors ? Object.keys(status.sensors).length : 0
                  return (
                    <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      Commands: {commands} · Size: {size} · Sensors: {sensorsCount}
                    </div>
                  )
                })()}
                {showSimDetails && (
                  <pre className={`${isDark ? 'bg-slate-900/60 text-slate-200' : 'bg-gray-50 text-gray-800'} text-xs p-3 rounded-lg overflow-auto max-h-64 border ${isDark ? 'border-slate-700/60' : 'border-gray-200'}`}>{JSON.stringify(simTypeOptions[formData.sim_type] || {}, null, 2)}</pre>
                )}
              </div>

              {/* Game Rules select */}
              <div className="space-y-2">
                <label className={`block text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Game Rules</label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
                  <div className="relative w-full max-w-md">
                    <select
                    name="gamerules"
                    value={formData.gamerules || ''}
                    onChange={handleInputChange}
                    className={`w-full appearance-none pr-10 px-3 py-2 border rounded-lg cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                    disabled={envLoading}
                  >
                    {Object.keys(gameSimOptions).map(key => (
                      <option key={key} value={key} className={isDark ? 'bg-slate-800' : 'bg-white'}>{key}</option>
                    ))}
                    </select>
                    <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                  </div>
                  <Button type="button" variant="outline" onClick={() => setShowGameDetails(s => !s)} className={`${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'} h-9 px-3 justify-self-start sm:justify-self-auto`}>
                    {showGameDetails ? 'Hide details' : 'Show details'}
                  </Button>
                </div>
                {(() => {
                  const cfg = gameSimOptions[formData.gamerules] || {}
                  const x = cfg.x_max ?? cfg.X_MAX ?? '—'
                  const y = cfg.y_max ?? cfg.Y_MAX ?? '—'
                  const objects = Array.isArray(cfg.objects) ? cfg.objects.length : 0
                  return (
                    <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      Grid: {x}×{y} · Objects: {objects}
                    </div>
                  )
                })()}
                {showGameDetails && (
                  <pre className={`${isDark ? 'bg-slate-900/60 text-slate-200' : 'bg-gray-50 text-gray-800'} text-xs p-3 rounded-lg overflow-auto max-h-64 border ${isDark ? 'border-slate-700/60' : 'border-gray-200'}`}>{JSON.stringify(gameSimOptions[formData.gamerules] || {}, null, 2)}</pre>
                )}
              </div>

              {/* Custom environments controls */}
              <div className="pt-4 flex items-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    if (showMyEnvs) {
                      setShowMyEnvs(false)
                    } else {
                      loadMyCustomEnvs()
                    }
                  }}
                  className={`h-11 flex-1 rounded-lg border text-sm font-medium transition-all ${isDark ? 'border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60' : 'border-gray-200 bg-white/80 text-gray-900 hover:bg-white'} flex items-center justify-between px-4`}
                >
                  <span>My environments</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showMyEnvs ? 'rotate-180' : ''} ${isDark ? 'text-slate-300' : 'text-gray-500'}`} />
                </Button>
                <Button
                  type="button"
                  onClick={() => setOpenEnvWizard(true)}
                  className="h-11 w-11 rounded-full bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white shadow-lg hover:shadow-xl transition-all p-0 flex items-center justify-center"
                  title="Create custom environment"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>

              {showMyEnvs && (
                <div className={`mt-4 rounded-2xl border shadow-xl ${isDark ? 'border-slate-700/60 bg-slate-900/60' : 'border-gray-200 bg-white/80 backdrop-blur-md'} p-4 space-y-4`}>
                  <div className="flex items-center justify-between">
                    <div className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>Your environments</div>
                    <Button type="button" variant="ghost" onClick={() => setShowMyEnvs(false)} className={`${isDark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-600 hover:bg-gray-100'} h-8 px-2`}>
                      <ChevronDown className="h-4 w-4 rotate-180" />
                    </Button>
                  </div>
                  {myEnvsLoading ? (
                    <div className={`${isDark ? 'text-slate-400' : 'text-gray-600'} text-sm`}>Loading...</div>
                  ) : (!myEnvs?.simTypes?.length && !myEnvs?.gameSims?.length) ? (
                    <div className={`${isDark ? 'text-slate-400' : 'text-gray-600'} text-sm`}>No environments found</div>
                  ) : (
                    <div className="space-y-4">
                      {/* Sim Types */}
                      {myEnvs?.simTypes?.length ? (
                        <div className="space-y-2">
                          <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Sim Types</div>
                          <div className="space-y-2">
                            {myEnvs.simTypes.map((simId) => {
                              const isSelected = formData.sim_type === simId
                              return (
                              <div key={simId} className={`flex items-center justify-between rounded-xl border px-4 py-3 shadow-sm ${isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-gray-200 bg-white/90 backdrop-blur'} ${isSelected ? 'ring-2 ring-[#5854f4]' : ''}`}>
                                <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {simId} {isSelected && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>Selected</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button type="button" variant="outline" className={`h-9 rounded-lg px-3 text-sm font-medium ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`} onClick={async () => {
                                    try {
                                      const cfg = await getSimTypeConfig(simId)
                                      setEditModal({ open: true, target: 'sim', id: simId, config: cfg })
                                    } catch { 
                                      setEditModal({ open: true, target: 'sim', id: simId, config: null }) 
                                    }
                                  }}>Edit</Button>
                                  <Button type="button" variant="outline" className={`h-9 rounded-lg px-4 text-sm font-medium ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`} onClick={async () => { 
                                    // Load config and add to options
                                    try {
                                      const cfg = await getSimTypeConfig(simId)
                                      setSimTypeOptions(prev => ({ ...prev, [simId]: cfg || {} }))
                                    } catch {
                                      setSimTypeOptions(prev => ({ ...prev, [simId]: {} }))
                                    }
                                    setFormData(prev => ({ ...prev, sim_type: simId }))
                                  }}>Use</Button>
                                </div>
                              </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}

                      {/* Game Rules */}
                      {myEnvs?.gameSims?.length ? (
                        <div className="space-y-2">
                          <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Game Rules</div>
                          <div className="space-y-2">
                            {myEnvs.gameSims.map((gameId) => {
                              const isSelected = formData.gamerules === gameId
                              return (
                              <div key={gameId} className={`flex items-center justify-between rounded-xl border px-4 py-3 shadow-sm ${isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-gray-200 bg-white/90 backdrop-blur'} ${isSelected ? 'ring-2 ring-[#5854f4]' : ''}`}>
                                <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {gameId} {isSelected && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>Selected</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button type="button" variant="outline" className={`h-9 rounded-lg px-3 text-sm font-medium ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`} onClick={async () => {
                                    try {
                                      const cfg = await getGameSimConfig(gameId)
                                      setEditModal({ open: true, target: 'game', id: gameId, config: cfg })
                                    } catch { 
                                      setEditModal({ open: true, target: 'game', id: gameId, config: null }) 
                                    }
                                  }}>Edit</Button>
                                  <Button type="button" variant="outline" className={`h-9 rounded-lg px-4 text-sm font-medium ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`} onClick={async () => { 
                                    // Load config and add to options
                                    try {
                                      const cfg = await getGameSimConfig(gameId)
                                      setGameSimOptions(prev => ({ ...prev, [gameId]: cfg || {} }))
                                    } catch {
                                      setGameSimOptions(prev => ({ ...prev, [gameId]: {} }))
                                    }
                                    setFormData(prev => ({ ...prev, gamerules: gameId }))
                                  }}>Use</Button>
                                </div>
                              </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add social links (Optional) - collapsible (left column on mobile only) */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} shadow-lg lg:hidden`}>
            <CardHeader>
              <CardTitle className={`flex items-center justify-between ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <span className="flex items-center"><LinkIcon className={`h-5 w-5 mr-2 ${isDark ? 'text-slate-400' : 'text-[#5854f4]'}`} /> Add social links <span className={`ml-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>(Optional)</span></span>
                <Button type="button" variant="ghost" onClick={() => setShowSocial(v => !v)} className={`${isDark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-700 hover:bg-gray-100'} h-8 px-2`}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showSocial ? 'rotate-180' : ''}`} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className={`${showSocial ? 'space-y-4' : 'hidden'} transition-all`}>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    <Globe className="inline h-4 w-4 mr-1" />
                    Website (Optional)
                  </label>
                  <input type="url" name="website" value={formData.website} onChange={handleInputChange} placeholder="https://yourrobot.com" className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    <Twitter className="inline h-4 w-4 mr-1" />
                    Twitter (Optional)
                  </label>
                  <input type="url" name="twitter" value={formData.twitter} onChange={handleInputChange} placeholder="https://twitter.com/yourrobot" className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    <MessageCircle className="inline h-4 w-4 mr-1" />
                    Telegram (Optional)
                  </label>
                  <input type="url" name="telegram" value={formData.telegram} onChange={handleInputChange} placeholder="https://t.me/yourrobot" className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connection Type (collapsible) - left column on mobile only */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} shadow-lg lg:hidden`}>
            <CardHeader>
              <CardTitle className={`flex items-center justify-between ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <span className="flex items-center"><Usb className={`h-5 w-5 mr-2 ${isDark ? 'text-slate-400' : 'text-[#5854f4]'}`} /> Connection Type</span>
                <Button type="button" variant="ghost" onClick={() => setShowConnection(v => !v)} className={`${isDark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-700 hover:bg-gray-100'} h-8 px-2`}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showConnection ? 'rotate-180' : ''}`} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className={`${showConnection ? 'space-y-4' : 'hidden'} transition-all`}>
              {/* Simulation Option */}
              <div
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  formData.connection_type === 'simulation'
                    ? isDark
                      ? 'border-[#5854f4] bg-[#5854f4]/10'
                      : 'border-[#5854f4] bg-[#5854f4]/10'
                    : isDark
                      ? 'border-slate-600 hover:border-slate-500'
                      : 'border-gray-300 hover:border-gray-400'
                }`}
                onClick={() => setFormData(prev => ({ ...prev, connection_type: 'simulation' }))}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    formData.connection_type === 'simulation'
                      ? 'border-[#5854f4] bg-[#5854f4]'
                      : isDark
                        ? 'border-slate-500'
                        : 'border-gray-400'
                  }`}>
                    {formData.connection_type === 'simulation' && (
                      <div className="w-full h-full rounded-full bg-white scale-50"></div>
                    )}
                  </div>
                  <div>
                    <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>Digital Twin Simulation</h3>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      Virtual robot simulation in the cloud
                    </p>
                  </div>
                </div>
              </div>

              {/* USB Option - Disabled */}
              <div className={`p-4 border-2 rounded-lg opacity-50 cursor-not-allowed relative mt-3 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded-full border-2 ${isDark ? 'border-slate-700' : 'border-gray-300'}`}></div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className={`${isDark ? 'text-slate-300' : 'text-gray-700'} font-medium`}>Physical USB Connection</h3>
                      <div className={`flex items-center space-x-1 px-2 py-1 rounded-full ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}>
                        <Lock className={`h-3 w-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                        <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Coming Soon</span>
                      </div>
                    </div>
                    <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                      Connect real hardware via USB
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Image Upload & Preview */}
        <div className="space-y-6">
          {/* Image Upload */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} shadow-lg`}>
            <CardHeader>
              <CardTitle className={`flex items-center space-x-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <Image className={`h-5 w-5 ${isDark ? 'text-slate-400' : 'text-[#5854f4]'}`} />
                <span>Robot Image</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Image Upload Area */}
              <div
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-[#5854f4] bg-[#5854f4]/10'
                    : isDark
                      ? 'border-slate-600 hover:border-slate-500'
                      : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                {imagePreview ? (
                  <div className="space-y-4">
                    <img
                      src={imagePreview}
                      alt="Robot preview"
                      className="w-full h-48 object-cover rounded-lg mx-auto"
                    />
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Click or drag to change image</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className={`h-12 w-12 mx-auto ${isDark ? 'text-slate-400' : 'text-gray-400'}`} />
                    <div>
                      <p className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>Upload robot image</p>
                      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Drag and drop or click to browse</p>
                      <p className={`text-xs mt-2 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>PNG, JPG up to 10MB</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

        {/* Add social links (Optional) - shown on desktop in right column */}
        <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} shadow-lg hidden lg:block`}>
          <CardHeader>
            <CardTitle className={`flex items-center justify-between ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <span className="flex items-center"><LinkIcon className={`h-5 w-5 mr-2 ${isDark ? 'text-slate-400' : 'text-[#5854f4]'}`} /> Add social links <span className={`ml-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>(Optional)</span></span>
              <Button type="button" variant="ghost" onClick={() => setShowSocial(v => !v)} className={`${isDark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-700 hover:bg-gray-100'} h-8 px-2`}>
                <ChevronDown className={`h-4 w-4 transition-transform ${showSocial ? 'rotate-180' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className={`${showSocial ? 'space-y-4' : 'hidden'} transition-all`}>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <Globe className="inline h-4 w-4 mr-1" />
                  Website (Optional)
                </label>
                <input type="url" name="website" value={formData.website} onChange={handleInputChange} placeholder="https://yourrobot.com" className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <Twitter className="inline h-4 w-4 mr-1" />
                  Twitter (Optional)
                </label>
                <input type="url" name="twitter" value={formData.twitter} onChange={handleInputChange} placeholder="https://twitter.com/yourrobot" className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <MessageCircle className="inline h-4 w-4 mr-1" />
                  Telegram (Optional)
                </label>
                <input type="url" name="telegram" value={formData.telegram} onChange={handleInputChange} placeholder="https://t.me/yourrobot" className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connection Type (collapsible) - shown on desktop in right column */}
        <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} shadow-lg hidden lg:block`}>
          <CardHeader>
            <CardTitle className={`flex items-center justify-between ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <span className="flex items-center"><Usb className={`h-5 w-5 mr-2 ${isDark ? 'text-slate-400' : 'text-[#5854f4]'}`} /> Connection Type</span>
              <Button type="button" variant="ghost" onClick={() => setShowConnection(v => !v)} className={`${isDark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-700 hover:bg-gray-100'} h-8 px-2`}>
                <ChevronDown className={`h-4 w-4 transition-transform ${showConnection ? 'rotate-180' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className={`${showConnection ? 'space-y-4' : 'hidden'} transition-all`}>
            {/* Simulation Option */}
            <div
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                formData.connection_type === 'simulation'
                  ? isDark
                    ? 'border-[#5854f4] bg-[#5854f4]/10'
                    : 'border-[#5854f4] bg-[#5854f4]/10'
                  : isDark
                    ? 'border-slate-600 hover:border-slate-500'
                    : 'border-gray-300 hover:border-gray-400'
              }`}
              onClick={() => setFormData(prev => ({ ...prev, connection_type: 'simulation' }))}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full border-2 ${
                  formData.connection_type === 'simulation'
                    ? 'border-[#5854f4] bg-[#5854f4]'
                    : isDark
                      ? 'border-slate-500'
                      : 'border-gray-400'
                }`}>
                  {formData.connection_type === 'simulation' && (
                    <div className="w-full h-full rounded-full bg-white scale-50"></div>
                  )}
                </div>
                <div>
                  <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} font-medium`}>Digital Twin Simulation</h3>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    Virtual robot simulation in the cloud
                  </p>
                </div>
              </div>
            </div>

            {/* USB Option - Disabled */}
            <div className={`p-4 border-2 rounded-lg opacity-50 cursor-not-allowed relative mt-3 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
              <div className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded-full border-2 ${isDark ? 'border-slate-700' : 'border-gray-300'}`}></div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className={`${isDark ? 'text-slate-300' : 'text-gray-700'} font-medium`}>Physical USB Connection</h3>
                    <div className={`flex items-center space-x-1 px-2 py-1 rounded-full ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}>
                      <Lock className={`h-3 w-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} />
                      <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>Coming Soon</span>
                    </div>
                  </div>
                  <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                    Connect real hardware via USB
                  </p>
                </div>
              </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview Card */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} shadow-lg`}>
            <CardHeader>
              <CardTitle className={isDark ? 'text-white' : 'text-gray-900'}>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mock robot card preview */}
              <div className={`${isDark ? 'bg-slate-800/70 border-slate-700/60' : 'bg-gray-50 border-gray-200'} border rounded-lg p-4 shadow-sm`}>
                <div className="space-y-3">
                  {/* Image preview */}
                  <div className={`w-full h-32 rounded-lg flex items-center justify-center overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Bot className={`h-8 w-8 ${isDark ? 'text-slate-500' : 'text-gray-400'}`} />
                    )}
                  </div>

                  {/* Info preview */}
                  <div>
                    <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} font-semibold`}>
                      {formData.name || 'Robot Name'}
                    </h3>
                    <div className={`flex items-center space-x-2 text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <span>Idle</span>
                    </div>
                  </div>

                  <div className="text-sm">
                    <div className="flex justify-between">
                      <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Ticker:</span>
                      <span className="text-[#5854f4] font-bold">
                        ${formData.ticker || 'TICKER'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>

      <EnvironmentWizardModal
        open={openEnvWizard}
        onClose={() => setOpenEnvWizard(false)}
        address={address}
        isDark={isDark}
        fetchOptions={loadEnvironmentOptions}
        onCreated={async ({ simTypeId, gameSimId }) => {
          // Add to options if not present
          if (simTypeId && !simTypeOptions[simTypeId]) {
            setSimTypeOptions(prev => ({ ...prev, [simTypeId]: {} }))
          }
          if (gameSimId && !gameSimOptions[gameSimId]) {
            setGameSimOptions(prev => ({ ...prev, [gameSimId]: {} }))
          }
          setFormData(prev => ({ ...prev, sim_type: simTypeId, gamerules: gameSimId }))
          // Refresh the user's environments after creating
          try { await loadMyCustomEnvs() } catch {}
        }}
      />

      {/* Edit single-step modal */}
      <EnvironmentWizardModal
        open={editModal.open}
        onClose={() => setEditModal({ open: false, target: null, id: '', config: null })}
        address={address}
        isDark={isDark}
        fetchOptions={loadEnvironmentOptions}
        singleStep={true}
        editTarget={editModal.target}
        presetSimTypeId={editModal.target === 'sim' ? editModal.id : ''}
        presetGameSimId={editModal.target === 'game' ? editModal.id : ''}
        prefillSimConfig={editModal.target === 'sim' ? editModal.config : null}
        prefillGameConfig={editModal.target === 'game' ? editModal.config : null}
        onCreated={async ({ simTypeId, gameSimId }) => {
          // Add to options if not present
          if (simTypeId && !simTypeOptions[simTypeId]) {
            setSimTypeOptions(prev => ({ ...prev, [simTypeId]: {} }))
          }
          if (gameSimId && !gameSimOptions[gameSimId]) {
            setGameSimOptions(prev => ({ ...prev, [gameSimId]: {} }))
          }
          setFormData(prev => ({ ...prev, sim_type: simTypeId || prev.sim_type, gamerules: gameSimId || prev.gamerules }))
          // Refresh list after editing
          try { await loadMyCustomEnvs() } catch {}
          setShowMyEnvs(true)
        }}
      />

      {/* Submit Button - Fuera del form para que siempre sea visible */}
      <div className="mt-8 flex justify-center">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || isUploadingImage || formData.connection_type === 'usb'}
          className="bg-gradient-to-r from-[#5854f4] to-[#7c3aed] hover:from-[#4c46e8] hover:to-[#6d28d9] text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 h-12 text-lg font-semibold px-8 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Bot className="mr-2 h-5 w-5" />
          {isUploadingImage
            ? 'Uploading Image...'
            : isSubmitting
            ? 'Creating Robot...'
            : formData.connection_type === 'usb'
              ? 'USB Connection Coming Soon'
              : 'Create Robot & Deploy Token'
          }
        </Button>
      </div>
    </div>
    </>
  )
}