import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { useToast } from '../../components/Toast'
import { ArrowLeft, Upload, Bot, Image, Usb, Lock, Globe, MessageCircle, Twitter, ChevronDown, Plus, Link2 as LinkIcon, Sparkles } from 'lucide-react'
import EnvironmentWizardModal from '../../components/EnvironmentWizardModal'
import { Link, useNavigate } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext'
import { useAccount } from 'wagmi'
import { CONTRACTS } from '../../utils/contracts'
import { writeContract, waitForTransactionReceipt, simulateContract, readContract, readContracts } from '@wagmi/core'
import { config as wagmiConfig } from '../../wagmi'
import { decodeEventLog, parseUnits, getCreate2Address, formatUnits } from 'viem'
import { readContract as viemRead } from '@wagmi/core'
import FactoryAbi from '../../contracts/abis/FullBondingCurveFactoryXToken.json'
import { PageMeta } from '../../components/PageMeta'

// Haven color theme for cute and compact design
const HAVEN_COLORS = {
  primary: '#5854f4',
  primaryHover: '#4c46e8',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444'
}

export default function HavenCreateRobot() {
  const { addToast } = useToast()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { address, isConnected, chainId } = useAccount()
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
    initialBuyXToken: '',
    creatorAllocationPercent: 0  // 0-5% creator allocation
  })
  const [isGlobal, setIsGlobal] = useState(true) // true = public, false = private
  const [activeTab, setActiveTab] = useState('robot') // 'robot' or 'agent'
  const [selectedPair, setSelectedPair] = useState('haven') // 'haven' or 'bnb'

  const [dragActive, setDragActive] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [showSocial, setShowSocial] = useState(false)
  const [showConnection, setShowConnection] = useState(true)
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
  const [brainOptions, setBrainOptions] = useState([])
  const [selectedBrain, setSelectedBrain] = useState('')
  const [brainLoading, setBrainLoading] = useState(false)
  const [createdEnvironment, setCreatedEnvironment] = useState(null)
  const [creatingEnvironment, setCreatingEnvironment] = useState(false)

  const ROBOT_API_BASE = '/api'
  const apiFetch = (path, init) => fetch(`${ROBOT_API_BASE}${path}`, init)

  // Get active contracts based on selected pair
  const getActiveContracts = () => {
    return selectedPair === 'bnb' ? CONTRACTS.bnb : CONTRACTS.haven
  }

  // Get max initial buy based on selected pair
  const getMaxInitialBuy = () => {
    if (selectedPair === 'bnb') {
      return { amount: 0.85, symbol: 'BNB', decimals: 18 }
    } else {
      return { amount: 800, symbol: 'HAVEN', decimals: 18 }
    }
  }

  // Helper function to get brain display name from ID
  const getBrainDisplayName = (brainId) => {
    if (!brainId || brainId === '0') return 'No AI Model'
    const brain = brainOptions.find(b => b.id === brainId)
    if (!brain) return `Model ${brainId}`
    const [provider, model] = brain.name.split('/')
    return model
      ? `${provider.charAt(0).toUpperCase() + provider.slice(1)} - ${model}`
      : brain.name
  }

  // Helper function to convert text brain ID to numeric ID (for migration)
  const getBrainIdFromText = (textId) => {
    if (!textId) return textId
    // If it's already numeric, return as-is
    if (/^\d+$/.test(textId)) return textId
    // If it contains a slash, it's the old text format - convert to numeric ID
    if (textId.includes('/')) {
      const brain = brainOptions.find(b => b.name === textId)
      return brain ? brain.id : textId
    }
    return textId
  }

  // On-chain assisted vanity mining using predictTokenAddress
  const mineVanitySalt = async (
    factoryAddress,
    { name, symbol, description, imageUrl, website, twitter, telegram, creator }
  ) => {
    const activeContracts = getActiveContracts()
    const targetSuffix = '4242'
    let attempts = 0

    console.log('[VanityMiner] Starting vanity mining for suffix:', targetSuffix)

    while (true) {
      attempts++

      // Generate random salt
      const randomBytes = new Uint8Array(32)
      crypto.getRandomValues(randomBytes)
      const salt = '0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')

      // Use predictTokenAddress to get the address for this salt
      try {
        const predictedAddress = await readContract(wagmiConfig, {
          abi: activeContracts.factory.abi,
          address: factoryAddress,
          functionName: 'predictTokenAddress',
          args: [name, symbol, description, imageUrl, website, twitter, telegram, creator, salt],
        })

        if (predictedAddress.toLowerCase().endsWith(targetSuffix)) {
          console.log('[VanityMiner] Found!', { salt, predictedAddress, attempts })
          return { salt, predictedAddress }
        }

        // Log progress every 100 attempts
        if (attempts % 100 === 0) {
          console.log('[VanityMiner] Attempts:', attempts, 'Last address:', predictedAddress)
          await new Promise(r => setTimeout(r, 0)) // Yield to prevent UI freeze
        }
      } catch (err) {
        console.error('[VanityMiner] Error predicting address:', err)
        throw err
      }
    }
  }
  // Compress a dataURL to webp with max dimension to reduce payload size
  const compressDataUrl = (dataUrl, { maxDim = 512, quality = 0.6 } = {}) => new Promise((resolve) => {
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
          let compressed = await compressDataUrl(dataUrl)

          // Check size after compression - if still too large, compress more aggressively
          const sizeInMB = (compressed.length * 3) / 4 / (1024 * 1024) // Rough estimate
          if (sizeInMB > 3.5) {
            console.log('[Image Upload] First compression too large, compressing more aggressively')
            compressed = await compressDataUrl(dataUrl, { maxDim: 400, quality: 0.5 })
          }

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
            console.error('[Image Upload] Failed:', up.status, upJson)
            setFormData(prev => ({ ...prev, image: dataUrl }))
            const errorMsg = upJson?.error || upJson?.detail || `HTTP ${up.status}`
            addToast(`Upload failed: ${errorMsg}`, 'warning')
          }
        } catch (err) {
          console.error('[Image Upload] Exception:', err)
          setIsUploadingImage(false)
          setFormData(prev => ({ ...prev, image: dataUrl }))
          addToast(`Upload error: ${err.message}`, 'warning')
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
          let compressed = await compressDataUrl(dataUrl)

          // Check size after compression - if still too large, compress more aggressively
          const sizeInMB = (compressed.length * 3) / 4 / (1024 * 1024)
          if (sizeInMB > 3.5) {
            console.log('[Image Upload] First compression too large, compressing more aggressively')
            compressed = await compressDataUrl(dataUrl, { maxDim: 400, quality: 0.5 })
          }

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
            console.error('[Image Upload] Failed:', up.status, upJson)
            setFormData(prev => ({ ...prev, image: dataUrl }))
            const errorMsg = upJson?.error || upJson?.detail || `HTTP ${up.status}`
            addToast(`Upload failed: ${errorMsg}`, 'warning')
          }
        } catch (err) {
          console.error('[Image Upload] Exception:', err)
          setIsUploadingImage(false)
          setFormData(prev => ({ ...prev, image: dataUrl }))
          addToast(`Upload error: ${err.message}`, 'warning')
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
    // Advanced fields are optional - no minimum length required

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
      console.log('[CreateBot] ===== STARTING TOKEN DEPLOYMENT =====')
      console.log('[CreateBot] Connected address:', address)
      console.log('[CreateBot] Chain ID:', chainId)
      console.log('[CreateBot] Is Connected:', isConnected)
      console.log('[CreateBot] Selected Pair:', selectedPair)
      console.log('[CreateBot] Active Contracts:', getActiveContracts())

      // Check if on correct chain
      if (chainId !== 56) {
        console.error('[CreateBot] Wrong chain! Expected BSC (56), got:', chainId)
        addToast('Please switch to BSC Mainnet (Chain ID 56)', 'error')
        setIsSubmitting(false)
        return
      }

      // 1) Ensure image URL is IPFS/HTTP; if dataURL, compress+upload once
      console.log('[CreateBot] Step 1: Processing image...')
      let imageUrl = formData.image
      console.log('[CreateBot] Image URL type:', typeof imageUrl, 'length:', imageUrl?.length)
      const isUrl = typeof imageUrl === 'string' && (imageUrl.startsWith('ipfs://') || imageUrl.startsWith('http'))
      console.log('[CreateBot] Is already URL:', isUrl)

      if (!isUrl) {
        console.log('[CreateBot] Uploading image to IPFS...')
        setIsUploadingImage(true)
        addToast('Uploading image to IPFS...', 'info', 30000)
        let compressedDataUrl = await compressDataUrl(formData.image)
        console.log('[CreateBot] Image compressed, size:', compressedDataUrl?.length)

        // Check size after compression - if still too large, compress more aggressively
        const sizeInMB = (compressedDataUrl.length * 3) / 4 / (1024 * 1024)
        if (sizeInMB > 3.5) {
          console.log('[Image Upload] First compression too large, compressing more aggressively')
          compressedDataUrl = await compressDataUrl(formData.image, { maxDim: 400, quality: 0.5 })
        }

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

      // 2) Vanity mining: Find a salt that produces a desirable token address
      console.log('[CreateBot] Starting vanity mining...')
      addToast('Mining for vanity address...', 'info', 3000)
      const activeContracts = getActiveContracts()

      // Get bonding curve parameters
      const bondingParams = selectedPair === 'bnb'
        ? {
            targetXTokens: parseUnits('17', 18), // 17 BNB
            virtualXTokens: parseUnits('3', 18),
            virtualProjectTokens: parseUnits('1073000000', 18),
            maxSupply: parseUnits('1000000000', 18),
            initialSupply: parseUnits('900000000', 18),
            uniswapSupply: parseUnits('100000000', 18)
          }
        : {
            targetXTokens: parseUnits('4', 18), // 4 HAVEN
            virtualXTokens: parseUnits('3', 18),
            virtualProjectTokens: parseUnits('1073000000', 18),
            maxSupply: parseUnits('1000000000', 18),
            initialSupply: parseUnits('900000000', 18),
            uniswapSupply: parseUnits('100000000', 18)
          }

      let bestSalt = null
      let bestAddress = null
      let bestScore = -1
      const MAX_ATTEMPTS = 50 // Try 50 different salts

      console.log('[CreateBot] Mining for vanity address (max', MAX_ATTEMPTS, 'attempts)...')

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        // Generate random salt
        const randomBytes = new Uint8Array(32)
        crypto.getRandomValues(randomBytes)
        const candidateSalt = '0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')

        try {
          // Predict address using TokenAddressPredictor contract
          const predictedAddress = await readContract(wagmiConfig, {
            address: activeContracts.predictor.address,
            abi: activeContracts.predictor.abi,
            functionName: 'predictTokenAddress',
            args: [
              nameTrimmed,
              symbolTrimmed,
              formData.description,
              imageUrl || '',
              formData.website || '',
              formData.twitter || '',
              formData.telegram || '',
              address,
              bondingParams.targetXTokens,
              bondingParams.virtualXTokens,
              bondingParams.virtualProjectTokens,
              bondingParams.maxSupply,
              bondingParams.initialSupply,
              bondingParams.uniswapSupply,
              BigInt(Math.floor(formData.creatorAllocationPercent * 100)),
              candidateSalt
            ]
          })

          // Score the address (prefer more leading zeros or specific patterns)
          const addressLower = predictedAddress.toLowerCase()
          let score = 0

          // Count leading zeros after 0x
          for (let j = 2; j < addressLower.length; j++) {
            if (addressLower[j] === '0') score += 10
            else break
          }

          // Bonus for repeating digits
          if (/(.)\1{2,}/.test(addressLower.slice(2))) score += 5

          // Bonus for having ticker in address
          const tickerLower = symbolTrimmed.toLowerCase()
          if (addressLower.includes(tickerLower.slice(0, 3))) score += 15

          if (score > bestScore) {
            bestScore = score
            bestSalt = candidateSalt
            bestAddress = predictedAddress
            console.log(`[CreateBot] New best: ${predictedAddress} (score: ${score}, attempt ${i + 1})`)
          }
        } catch (err) {
          console.warn('[CreateBot] Prediction failed for salt:', candidateSalt, err.message)
        }
      }

      const salt = bestSalt || ('0x' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''))
      console.log('[CreateBot] Final salt:', salt)
      if (bestAddress) {
        console.log('[CreateBot] Predicted address:', bestAddress, 'with score:', bestScore)
      }

      // 2a) Ensure you have enough HAVEN balance for the initial buy (using Factory's configured X_TOKEN_ADDRESS)
      // Only check HAVEN balance if using HAVEN pair (BNB pair uses native BNB as msg.value)
      if (xTokenAmount > 0n && selectedPair === 'haven') {
        try {
          const erc20BalAbi = [
            { "type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"account","type":"address"}],"outputs":[{"name":"","type":"uint256"}] },
            { "type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"uint8"}] }
          ]
          let factoryXToken = activeContracts.xtoken.address
          try {
            const chainX = await readContract(wagmiConfig, { abi: activeContracts.factory.abi, address: activeContracts.factory.address, functionName: 'X_TOKEN_ADDRESS' })
            if (typeof chainX === 'string' && chainX.length === 42) factoryXToken = chainX
          } catch {}
          console.log('[CreateBot] Checking HAVEN balance for token:', factoryXToken)
          console.log('[CreateBot] User address:', address)
          console.log('[CreateBot] Required amount:', xTokenAmount.toString())
          const [rawDec, rawBal] = await Promise.all([
            readContract(wagmiConfig, { abi: erc20BalAbi, address: factoryXToken, functionName: 'decimals' }).catch(() => xTokenDecimals),
            readContract(wagmiConfig, { abi: erc20BalAbi, address: factoryXToken, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
          ])
          const useDec = Number(rawDec ?? xTokenDecimals) || xTokenDecimals
          console.log('[CreateBot] Token decimals:', useDec)
          console.log('[CreateBot] User balance:', rawBal?.toString())
          console.log('[CreateBot] Balance formatted:', formatUnits(BigInt(rawBal||0n), useDec))
          console.log('[CreateBot] Required formatted:', formatUnits(xTokenAmount, useDec))
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
      // Only check HAVEN allowance if using HAVEN pair (BNB pair uses native BNB as msg.value)
      if (xTokenAmount > 0n && selectedPair === 'haven') {
        try {
          const erc20ApproveAbi = [
            { "type":"function","name":"allowance","stateMutability":"view","inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"outputs":[{"name":"","type":"uint256"}] },
            { "type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}] }
          ]
          let factoryXToken = activeContracts.xtoken.address
          try {
            const chainX = await readContract(wagmiConfig, { abi: activeContracts.factory.abi, address: activeContracts.factory.address, functionName: 'X_TOKEN_ADDRESS' })
            if (typeof chainX === 'string' && chainX.length === 42) factoryXToken = chainX
          } catch {}
          const currentAllowance = await readContract(wagmiConfig, {
            abi: erc20ApproveAbi,
            address: factoryXToken,
            functionName: 'allowance',
            args: [address, activeContracts.factory.address],
          }).catch(() => 0n)
          if (currentAllowance < xTokenAmount) {
            addToast('Approving HAVEN for factory (infinite)...', 'info', 30000)
            const maxUint = (2n ** 256n) - 1n
            const approveHash = await writeContract(wagmiConfig, {
              abi: erc20ApproveAbi,
              address: factoryXToken,
              functionName: 'approve',
              args: [activeContracts.factory.address, maxUint],
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
        console.log('[CreateBot] ===== TOKEN DEPLOYMENT DEBUG =====')
        console.log('[CreateBot] Selected Pair:', selectedPair)
        console.log('[CreateBot] Factory Address:', activeContracts.factory.address)
        console.log('[CreateBot] XToken Address:', activeContracts.xtoken.address)
        console.log('[CreateBot] Salt:', salt)
        console.log('[CreateBot] Initial Buy Amount:', xTokenAmount.toString())

        // Convert creator allocation percent to basis points (5% = 500 bps)
        const creatorAllocationBps = Math.floor(formData.creatorAllocationPercent * 100)
        console.log('[CreateBot] Creator Allocation BPS:', creatorAllocationBps)

        // BSC_COMPATIBLE (BNB) uses payable with msg.value, BSC_HAVEN uses xTokenAmount param
        const isBNBPair = selectedPair === 'bnb'
        const createTokenArgs = isBNBPair
          ? [
              nameTrimmed,
              symbolTrimmed,
              formData.description,
              imageUrl || '',
              formData.website || '',
              formData.twitter || '',
              formData.telegram || '',
              creatorAllocationBps,
              salt,
            ]
          : [
              nameTrimmed,
              symbolTrimmed,
              formData.description,
              imageUrl || '',
              formData.website || '',
              formData.twitter || '',
              formData.telegram || '',
              xTokenAmount,
              creatorAllocationBps,
              salt,
            ]

        console.log('[CreateBot] Is BNB Pair:', isBNBPair)
        console.log('[CreateBot] Args Count:', createTokenArgs.length)
        console.log('[CreateBot] Args:', createTokenArgs)
        console.log('[CreateBot] msg.value:', isBNBPair ? xTokenAmount.toString() : 'undefined')

        console.log('[CreateBot] Calling simulateContract...')
        sim = await simulateContract(wagmiConfig, {
          abi: activeContracts.factory.abi,
          address: activeContracts.factory.address,
          functionName: 'createToken',
          args: createTokenArgs,
          value: isBNBPair ? xTokenAmount : undefined, // Send BNB as msg.value for BNB pair
        })
        console.log('[CreateBot] Simulation successful, result:', sim.result)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[CreateBot] ===== SIMULATION ERROR =====')
        console.error('[CreateBot] Error object:', err)
        console.error('[CreateBot] Error message:', err?.message)
        console.error('[CreateBot] Error shortMessage:', err?.shortMessage)
        console.error('[CreateBot] Error cause:', err?.cause)
        console.error('[CreateBot] Error details:', err?.details)
        console.error('[CreateBot] Error metaMessages:', err?.metaMessages)
        console.error('[CreateBot] Full error:', JSON.stringify(err, null, 2))
        const msg = err?.shortMessage || err?.message || 'Simulation failed (possible invalid params or paused factory)'
        addToast(msg, 'error')
        setIsSubmitting(false)
        throw err
      }

      console.log('[CreateBot] Sending transaction...')
      const txHash = await writeContract(wagmiConfig, sim.request).catch((err) => {
        console.error('[CreateBot] ===== WRITE CONTRACT ERROR =====')
        console.error('[CreateBot] Error:', err)
        console.error('[CreateBot] Error message:', err?.message)
        console.error('[CreateBot] Error shortMessage:', err?.shortMessage)
        console.error('[CreateBot] Error code:', err?.code)
        console.error('[CreateBot] User rejected:', err?.code === 'ACTION_REJECTED')
        const msg = err?.shortMessage || err?.message || 'Transaction failed'
        addToast(msg, 'error')
        setIsSubmitting(false)
        throw err
      })
      console.log('[CreateBot] Transaction sent! Hash:', txHash)
      // Show long-running toast only after user confirmed in wallet
      addToast('Deploying robot contract... This can take a minute.', 'info', 30000)
      console.log('[CreateBot] Waiting for transaction receipt...')
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: txHash }).catch((err) => {
        console.error('[CreateBot] ===== RECEIPT ERROR =====')
        console.error('[CreateBot] Error:', err)
        console.error('[CreateBot] Error message:', err?.message)
        addToast('Failed waiting for receipt', 'error')
        setIsSubmitting(false)
        throw err
      })
      console.log('[CreateBot] Transaction mined! Receipt:', receipt)

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

      // Read target_eth from the deployed token contract
      let targetEth = '4000000000000000000' // Default 4 HAVEN as fallback
      try {
        const TOKEN_ABI = ['function targetXTokens() view returns (uint256)']
        const onchainTarget = await readContract(wagmiConfig, {
          abi: TOKEN_ABI,
          address: tokenAddress,
          functionName: 'targetXTokens',
        })
        targetEth = onchainTarget.toString()
        // eslint-disable-next-line no-console
        console.log('[CreateBot] Read targetXTokens from contract:', targetEth)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CreateBot] Failed to read targetXTokens, using default:', err.message)
      }

      // Submit for automatic BSCScan verification
      console.log('[CreateBot] Token deployed at:', tokenAddress)
      addToast('Token deployed! Preparing verification...', 'success', 3000)

      // Wait for BSCScan to index the contract (typically takes 10-30 seconds)
      console.log('[CreateBot] Waiting 15 seconds for BSCScan to index the contract...')
      await new Promise(resolve => setTimeout(resolve, 15000))

      console.log('[CreateBot] Submitting contract for verification via BSCScan API (frontend)...')
      addToast('Submitting verification to BSCScan...', 'info', 3000)

      // Get contract addresses for verification
      const verifyContracts = getActiveContracts()
      console.log('[CreateBot] Using contracts for verification:', verifyContracts)

      try {
        // Read the flattened source code from public folder
        const contractType = selectedPair === 'bnb' ? 'BSC_COMPATIBLE' : 'BSC_HAVEN'
        const sourceCodeUrl = contractType === 'BSC_HAVEN'
          ? '/FullBondingCurveERC20XToken_Flattened.sol'
          : '/FullBondingCurveERC20WBNB_Flattened.sol'

        console.log('[CreateBot] Fetching source code from:', sourceCodeUrl)
        const sourceResponse = await fetch(sourceCodeUrl)
        const sourceCode = await sourceResponse.text()
        console.log('[CreateBot] Source code length:', sourceCode.length)

        // Helper to convert string to bytes32
        const stringToBytes32 = (str) => {
          const bytes = new TextEncoder().encode(str.substring(0, 32))
          const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0')
          return '0x' + hex
        }

        // This is not used for verification - we use keccak256 directly below

        // Get bonding curve parameters
        const bondingParams = contractType === 'BSC_HAVEN'
          ? {
              targetXTokens: '4000000000000000000',
              virtualXTokens: '3000000000000000000',
              virtualProjectTokens: '1073000000000000000000000000',
              maxSupply: '1000000000000000000000000000',
              initialSupply: '900000000000000000000000000',
              uniswapSupply: '100000000000000000000000000'
            }
          : {
              targetXTokens: '17000000000000000000',
              virtualXTokens: '3000000000000000000',
              virtualProjectTokens: '1073000000000000000000000000',
              maxSupply: '1000000000000000000000000000',
              initialSupply: '900000000000000000000000000',
              uniswapSupply: '100000000000000000000000000'
            }

        // Encode constructor arguments using web3/ethers
        const { encodeAbiParameters, keccak256 } = await import('viem')

        const socialHash = keccak256(new TextEncoder().encode((formData.website || '') + (formData.twitter || '') + (formData.telegram || '')))

        const constructorTypes = [
          { type: 'string' },   // name
          { type: 'string' },   // symbol
          { type: 'bytes32' },  // descriptionHash
          { type: 'bytes32' },  // imageHash
          { type: 'bytes32' },  // socialHash
          { type: 'address' },  // creator
          { type: 'address' },  // factory
          { type: 'address' },  // graduationHelper
          { type: 'address' },  // xTokenAddress
          { type: 'address' },  // uniswapV2Router
          { type: 'address' },  // weth
          { type: 'tuple', components: [
            { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
            { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }
          ]},
          { type: 'uint256' }   // creatorAllocationBps
        ]

        const constructorArgs = [
          nameTrimmed,
          symbolTrimmed,
          stringToBytes32(formData.description),
          stringToBytes32(imageUrl || ''),
          socialHash,
          address,
          verifyContracts.factory.address,
          verifyContracts.graduationHelper.address,
          verifyContracts.xtoken.address,
          '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap Router
          '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
          [
            bondingParams.targetXTokens,
            bondingParams.virtualXTokens,
            bondingParams.virtualProjectTokens,
            bondingParams.maxSupply,
            bondingParams.initialSupply,
            bondingParams.uniswapSupply
          ],
          BigInt(Math.floor((formData.creatorAllocationPercent || 0) * 100))
        ]

        console.log('[CreateBot] Constructor args:', constructorArgs)

        const encodedConstructorArgs = encodeAbiParameters(constructorTypes, constructorArgs).slice(2)
        console.log('[CreateBot] Encoded constructor args length:', encodedConstructorArgs.length)

        const contractName = contractType === 'BSC_HAVEN'
          ? 'FullBondingCurveERC20XToken'
          : 'FullBondingCurveERC20WBNB'

        const sourceFileName = contractType === 'BSC_HAVEN'
          ? 'FullBondingCurveERC20XToken_Flattened.sol'
          : 'FullBondingCurveERC20WBNB_Flattened.sol'

        // Create Standard JSON Input format with viaIR support
        const standardJsonInput = {
          language: 'Solidity',
          sources: {
            [sourceFileName]: {
              content: sourceCode
            }
          },
          settings: {
            optimizer: {
              enabled: true,
              runs: 1
            },
            viaIR: true,
            evmVersion: 'paris',
            outputSelection: {
              '*': {
                '*': ['evm.bytecode', 'evm.deployedBytecode', 'abi']
              }
            }
          }
        }

        // Submit to BSCScan using v2 API
        // v2 API requires chainid and apikey in URL query params
        const urlParams = new URLSearchParams({
          apikey: 'E6JDRR3FPWMU8UWM2I4MN2RATY56STUVDZ',
          chainid: '56',
          module: 'contract',
          action: 'verifysourcecode'
        })

        const verifyParams = new URLSearchParams({
          contractaddress: tokenAddress,
          sourceCode: JSON.stringify(standardJsonInput),
          codeformat: 'solidity-standard-json-input',
          contractname: `${sourceFileName}:${contractName}`,
          compilerversion: 'v0.8.26+commit.8a97fa7a',
          constructorArguements: encodedConstructorArgs,
          licenseType: '3'
        })

        console.log('[CreateBot] Submitting to BSCScan v2 API...')
        const verifyResponse = await fetch(`https://api.etherscan.io/v2/api?${urlParams.toString()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: verifyParams.toString()
        })

        const verifyResult = await verifyResponse.json()
        console.log('[CreateBot] BSCScan response:', verifyResult)

        if (verifyResult.status === '1') {
          console.log('[CreateBot] Verification submitted! GUID:', verifyResult.result)
          addToast(`Verification submitted! It will appear on BSCScan in 1-2 minutes. GUID: ${verifyResult.result.substring(0, 20)}...`, 'success', 10000)
        } else {
          console.error('[CreateBot] Verification submission failed:', verifyResult.result)
          addToast(`Token deployed successfully! Manual verification needed. Error: ${verifyResult.result}`, 'warning', 8000)
        }
      } catch (verifyError) {
        console.error('[CreateBot] Verification request failed:', verifyError)
        addToast(`Token deployed successfully! Manual verification may be needed.`, 'success', 6000)
      }

      const bscscanUrl = `https://bscscan.com/address/${tokenAddress}#code`
      console.log('[CreateBot] BSCScan URL:', bscscanUrl)

      // Register the bonding curve type with HavenRouter
      const isWBNB = selectedPair === 'bnb'
      console.log(`[CreateBot] Registering bonding curve as ${isWBNB ? 'WBNB' : 'HAVEN'} type...`)

      try {
        const registerSim = await simulateContract(wagmiConfig, {
          abi: CONTRACTS.havenRouterV2.abi,
          address: CONTRACTS.havenRouterV2.address,
          functionName: 'registerBondingCurveType',
          args: [tokenAddress, isWBNB],
        })

        const registerHash = await writeContract(wagmiConfig, registerSim.request)
        console.log('[CreateBot] Registration transaction submitted:', registerHash)

        const registerReceipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: registerHash,
          timeout: 120000,
        })

        if (registerReceipt.status === 'success') {
          console.log('[CreateBot] ✅ Bonding curve registered successfully')
          addToast(`Token registered with HavenRouter as ${isWBNB ? 'BNB' : 'HAVEN'} type`, 'success')
        } else {
          console.error('[CreateBot] Registration transaction failed')
          addToast('Token registration failed - manual registration required', 'warning')
        }
      } catch (registerError) {
        console.error('[CreateBot] Registration error:', registerError)
        addToast('Token registration failed - manual registration required', 'warning')
      }

      // Determine brain_id: use created environment, selected brain, or 0 (no brain)
      const rawBrainId = createdEnvironment?.brain_id || selectedBrain || '0'
      // Convert to numeric ID if it's in text format (for migration)
      const finalBrainId = getBrainIdFromText(rawBrainId)

      const payload = {
        is_advanced: hasAdvanced,
        is_global: isGlobal,
        wallet: address,
        sim_type: formData.sim_type,
        name: formData.name,
        ticker: formData.ticker,
        image: imageUrl || '',
        contract: '0x0000000000000000000000000000000000000000',
        bonding_contract: tokenAddress || '',
        brain_id: finalBrainId,
        target_eth: targetEth,
        deployed_block_number: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
        pairType: selectedPair // 'bnb' or 'haven' - tells backend which virtual reserves to use
      }

      // For ROBOTS: always send gamerules (simulation config)
      // For AGENTS: always send gamerules (personality) and status
      if (activeTab === 'robot') {
        // Robots: gamerules is the simulation environment config
        payload.gamerules = formData.gamerules
      } else if (activeTab === 'agent') {
        // Agents: gamerules is the personality
        payload.gamerules = formData.gamerules || ''
        // Backend expects both gamerules AND status (they're the same value for agents)
        payload.status = formData.gamerules || 'active'
      }

      if (hasAdvanced) {
        const project_info = {}
        if (det) project_info['Detailed Description'] = det
        if (how) project_info['How it works'] = how
        if (road) project_info['Roadmap'] = road
        if (team) project_info['About Team'] = team
        payload.project_info = project_info
      }

      // Use different endpoints based on active tab
      const endpoint = activeTab === 'agent' ? `${ROBOT_API_BASE}/agents/add` : `${ROBOT_API_BASE}/robot/add`
      console.log('[CreateBot] Submitting to endpoint:', endpoint, 'with payload:', payload)

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', wallet: address },
        body: JSON.stringify(payload)
      })

      let result
      const responseText = await response.text()
      console.log('[CreateBot] Response status:', response.status, 'Response text:', responseText)
      try {
        result = responseText ? JSON.parse(responseText) : { error: 'Empty response' }
      } catch (e) {
        console.error('[CreateBot] Failed to parse JSON:', e)
        result = { error: 'Invalid JSON response', rawResponse: responseText }
      }

      if (response.ok) {
        addToast(activeTab === 'agent' ? 'Robot agent created successfully!' : 'Robot created successfully!', 'success')
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
        // Redirect to Portfolio
        navigate('/portfolio')
      } else {
        console.error('[CreateBot] Error response:', result)
        const errorMsg = result.error || result.message || result.rawResponse || 'Failed to create robot agent'
        addToast(`Error: ${errorMsg}`, 'error')
      }
    } catch (error) {
      console.error('[CreateBot] ===== CAUGHT ERROR IN MAIN TRY-CATCH =====')
      console.error('[CreateBot] Error:', error)
      console.error('[CreateBot] Error message:', error?.message)
      console.error('[CreateBot] Error stack:', error?.stack)
      console.error('[CreateBot] Error name:', error?.name)
      console.error('[CreateBot] Error toString:', error?.toString())
      addToast('Network error. Please try again.', 'error')
    } finally {
      console.log('[CreateBot] Finalizing deployment attempt...')
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
      console.log('[Brain Options] No wallet address, skipping')
      return
    }
    setBrainLoading(true)
    try {
      console.log('[Brain Options] Fetching brain options for wallet:', address)
      const response = await fetch(`${ROBOT_API_BASE}/robot/brain-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_wallet: address })
      })

      console.log('[Brain Options] Response status:', response.status)
      console.log('[Brain Options] Response headers:', response.headers.get('content-type'))

      if (!response.ok) {
        console.error('[Brain Options] Server error:', response.status, response.statusText)
        // Use default brain options if backend fails
        const defaultOptions = [
          { id: '1', name: 'openai/o3-mini' },
          { id: '2', name: 'anthropic/claude-haiku-4.5' },
          { id: '3', name: 'deepseek/deepseek-v3.1-terminus' },
          { id: '4', name: 'google/gemini-2.0-flash-lite-001' },
          { id: '5', name: 'x-ai/grok-3-mini' }
        ]
        setBrainOptions(defaultOptions)
        console.log('[Brain Options] Using default options due to server error')
        return
      }

      const responseText = await response.text()
      console.log('[Brain Options] Raw response text:', responseText)

      let data
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        console.error('[Brain Options] Failed to parse JSON:', e)
        console.log('[Brain Options] Response was:', responseText)
        setBrainOptions([])
        return
      }

      console.log('[Brain Options] Parsed response data:', data)

      // Handle different response formats
      let options = []

      if (data.option_list && Array.isArray(data.option_list)) {
        // Standard format: { option_list: [...] }
        options = data.option_list
      } else if (typeof data === 'object' && !Array.isArray(data)) {
        // Object with numeric keys: { "0": null, "1": "openai/o3-mini", ... }
        // Convert to array of { id, name } objects, filtering out null values
        options = Object.entries(data)
          .filter(([_, value]) => value !== null && value !== undefined)
          .map(([id, name]) => ({ id, name }))
      } else if (Array.isArray(data)) {
        // Direct array response
        options = data.filter(option => option !== null && option !== undefined)
      }

      console.log('[Brain Options] Extracted options:', options)

      if (options.length > 0) {
        setBrainOptions(options)
      } else {
        console.warn('[Brain Options] No valid options found in response')
        setBrainOptions([])
      }
    } catch (error) {
      console.error('[Brain Options] Failed to load brain options:', error)
      setBrainOptions([])
    } finally {
      setBrainLoading(false)
    }
  }

  // Load brain options when wallet connects
  useEffect(() => {
    if (address && isConnected) {
      loadBrainOptions()
    }
  }, [address, isConnected])

  // Migrate old text-format selectedBrain to numeric ID when brain options load
  useEffect(() => {
    if (brainOptions.length > 0 && selectedBrain && selectedBrain.includes('/')) {
      const numericId = getBrainIdFromText(selectedBrain)
      if (numericId !== selectedBrain) {
        console.log('[Brain Migration] Converting old brain ID:', selectedBrain, '→', numericId)
        setSelectedBrain(numericId)
      }
    }
  }, [brainOptions, selectedBrain])

  const createEnvironment = async () => {
    if (!address) {
      addToast('Please connect your wallet first', 'warning')
      return
    }
    if (!selectedBrain) {
      addToast('Please select an AI brain first', 'warning')
      return
    }
    if (!formData.gamerules) {
      addToast('Please describe your robot agent personality first', 'warning')
      return
    }

    // If environment already created, don't create again
    if (createdEnvironment) {
      addToast('Environment already created!', 'info')
      return
    }

    setCreatingEnvironment(true)
    try {
      const targetBrainId = getBrainIdFromText(selectedBrain)
      const targetStatus = formData.gamerules

      // First, check if this environment already exists
      console.log('[Create Environment] Checking for existing environment...')
      const existingResponse = await fetch(`${ROBOT_API_BASE}/agents/get-agents-by-creator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_wallet: address })
      })

      // Handle both 200 OK and 404 (no agents found) - both are valid responses
      if (existingResponse.ok || existingResponse.status === 404) {
        const existingData = await existingResponse.json()
        // Handle both success response with agents array and "no agents found" error message
        const existingAgents = Array.isArray(existingData?.agents) ? existingData.agents : []

        // Check if an agent with the same brain_id and status already exists
        const existingAgent = existingAgents.find(agent =>
          agent.brain_id === targetBrainId && agent.status === targetStatus
        )

        if (existingAgent) {
          console.log('[Create Environment] Found existing environment:', existingAgent)
          setCreatedEnvironment(existingAgent)
          addToast('Using existing environment with this brain and personality!', 'success')
          setCreatingEnvironment(false)
          return
        }

        console.log('[Create Environment] No existing environment found, creating new one...')
      }

      // If no existing environment found, create a new one
      const payload = {
        creator_wallet: address,
        brain_id: targetBrainId,
        status: targetStatus
      }
      console.log('[Create Environment] Creating new agent environment with payload:', payload)
      const response = await fetch(`${ROBOT_API_BASE}/agents/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()
      console.log('[Create Environment] Response:', data)

      if (response.ok) {
        setCreatedEnvironment(data)
        addToast('Environment created successfully!', 'success')
        // Reload environments to show the new one
        loadMyCustomEnvs()
      } else {
        // Check if this is a duplicate environment error
        const isDuplicate = data.error?.includes('duplicate key') || data.error?.includes('23505')
        if (isDuplicate) {
          addToast(`This agent environment already exists. Please use a different model or personality.`, 'warning')
          console.warn('[Create Environment] Duplicate agent environment - combination already exists')
        } else {
          addToast(`Failed to create environment: ${data.error || 'Unknown error'}`, 'error')
        }
      }
    } catch (error) {
      console.error('[Create Environment] Error:', error)
      addToast('Failed to create environment', 'error')
    } finally {
      setCreatingEnvironment(false)
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
        // Only set default gamerules for robot tab, not agent tab (agents use custom personality text)
        let nextGame = prev.gamerules || ''
        if (activeTab === 'robot') {
          // For robot tab: set to first game key if current value is not in the list
          nextGame = gameKeys.includes(prev.gamerules) ? prev.gamerules : (firstGameKey || '')
          console.log('[loadEnvironmentOptions] Setting gamerules for robot tab:', nextGame)
        } else {
          // For agent tab: never set a default, keep current value or empty
          nextGame = prev.gamerules || ''
          console.log('[loadEnvironmentOptions] Keeping gamerules for agent tab:', nextGame)
        }
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

  // Load XTOKEN balance when wallet connected
  useEffect(() => {
    const load = async () => {
      try {
        if (!isConnected || !address) { setXTokenBalance('0'); return }
        const activeContracts = getActiveContracts()

        // For BNB pair, get native BNB balance instead of WBNB
        if (selectedPair === 'bnb') {
          console.log('[Balance] Fetching native BNB balance for:', address)
          const { getBalance } = await import('@wagmi/core')
          const balance = await getBalance(wagmiConfig, { address })
          console.log('[Balance] Native BNB balance:', balance.formatted)
          setXTokenBalance(balance.formatted)
          setXTokenDecimals(18)
          return
        }

        // For HAVEN pair, get HAVEN token balance
        console.log('[Balance] Fetching HAVEN token balance for:', address)
        const erc20Abi = [
          { "type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"uint8"}] },
          { "type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"account","type":"address"}],"outputs":[{"name":"","type":"uint256"}] }
        ]
        const results = await readContracts(wagmiConfig, {
          contracts: [
            { abi: erc20Abi, address: activeContracts.xtoken.address, functionName: 'decimals' },
            { abi: erc20Abi, address: activeContracts.xtoken.address, functionName: 'balanceOf', args: [address] },
          ]
        }).catch(() => null)
        const decimals = Number(results?.[0]?.result ?? 18)
        const bal = BigInt(results?.[1]?.result ?? 0n)
        console.log('[Balance] HAVEN balance:', formatUnits(bal, decimals))
        setXTokenBalance(formatUnits(bal, decimals))
        setXTokenDecimals(Number.isFinite(decimals) ? decimals : 18)
      } catch (err) {
        console.error('[Balance] Error fetching balance:', err)
        setXTokenBalance('0')
      }
    }
    load()
  }, [isConnected, address, selectedPair])

  // Clear gamerules when switching to agent tab to prevent robot values from showing
  useEffect(() => {
    console.log('[Tab Switch] activeTab changed to:', activeTab)
    if (activeTab === 'agent') {
      console.log('[Tab Switch] Clearing gamerules for agent tab')
      // Always clear gamerules when switching to agent tab
      setFormData(prev => {
        console.log('[Tab Switch] Previous gamerules:', prev.gamerules)
        return { ...prev, gamerules: '' }
      })
      setCreatedEnvironment(null)
    }
  }, [activeTab])

  // Clear created environment when brain or personality changes
  useEffect(() => {
    setCreatedEnvironment(null)
  }, [selectedBrain, formData.gamerules])

  // Reload environments when switching tabs if My Envs is visible
  useEffect(() => {
    if (showMyEnvs && address) {
      console.log('[Tab Switch] activeTab changed to:', activeTab, '- reloading environments')
      loadMyCustomEnvs()
    }
    // eslint-disable-next-line react-hooks-exhaustive-deps
  }, [activeTab])

  const loadMyCustomEnvs = async () => {
    if (!address) {
      addToast('Please connect your wallet to view your environments', 'warning')
      return
    }
    setMyEnvsLoading(true)
    try {
      console.log('[My Envs] Loading environments for activeTab:', activeTab)
      // For agent tab, load agent environments; for robot tab, load robot environments
      if (activeTab === 'agent') {
        console.log('[My Envs] Loading agent environments from /agents/get-agents-by-creator')
        // Load agent environments from /agents/get-agents-by-creator
        const response = await fetch(`${ROBOT_API_BASE}/agents/get-agents-by-creator`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creator_wallet: address })
        })
        const json = await response.json()
        const agents = Array.isArray(json?.agents) ? json.agents : []
        console.log('[My Envs] Fetched agents:', agents)

        // Store full agent pairs (brain_id + status) for agent tab
        setMyEnvs({ agentPairs: agents })
      } else {
        console.log('[My Envs] Loading robot environments from /robot/robots/' + address)
        // Load robot environments (original logic)
        const res = await apiFetch(`/robot/robots/${address}`)
        const json = await res.json().catch(() => null)
        const list = Array.isArray(json?.robots) ? json.robots : []
        console.log('[My Envs] Fetched robots:', list)

        const simSet = new Set()
        const gameSet = new Set()
        for (const env of list) {
          const s = env?.sim_type || env?.simType || env?.sim_type_id || env?.simTypeId || ''
          const g = env?.game_sim_id || env?.gamerules || env?.gameRules || env?.gameSimId || ''
          if (s) simSet.add(s)
          if (g) gameSet.add(g)
        }
        console.log('[My Envs] Robot sim_types:', Array.from(simSet))
        console.log('[My Envs] Robot game_sims:', Array.from(gameSet))
        setMyEnvs({ simTypes: Array.from(simSet), gameSims: Array.from(gameSet) })
      }

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
        title="Create Robot Agent - HAVEN"
        description="Create your own digital twin robot agent on HAVEN. Deploy your robot agent with custom configurations and start trading on the bonding curve marketplace."
        url="https://haven-base.vercel.app/create"
      />
    <div className="space-y-3 pb-4 max-w-7xl mx-auto px-2">
      {/* Compact Header */}
      <div className="flex items-center gap-2 mb-3">
        <Link
          to="/"
          className={`p-1.5 rounded-xl transition-all duration-300 hover:scale-110 ${
            isDark ? 'hover:bg-slate-800/60 text-slate-400' : 'hover:bg-gray-100 text-gray-600'
          }`}
          style={{
            backgroundColor: `${HAVEN_COLORS.primary}15`,
            border: `2px solid ${HAVEN_COLORS.primary}30`
          }}
        >
          <ArrowLeft className="h-4 w-4" style={{color: HAVEN_COLORS.primary}} />
        </Link>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl animate-pulse" style={{
            background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}20, ${HAVEN_COLORS.primary}10)`,
            border: `2px solid ${HAVEN_COLORS.primary}40`
          }}>
            <Bot className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
          </div>
          <div>
            <h1 className={`text-xl font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Create New Robot
            </h1>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
              Deploy your digital twin to marketplace
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('robot')}
          className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${
            activeTab === 'robot'
              ? `text-white shadow-lg`
              : `${isDark ? 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
          }`}
          style={activeTab === 'robot' ? {
            background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primary}CC)`,
            boxShadow: `0 4px 20px ${HAVEN_COLORS.primary}40`
          } : {}}
        >
          <Bot className="inline h-5 w-5 mr-2" />
          Create Robot
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('agent')}
          className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${
            activeTab === 'agent'
              ? `text-white shadow-lg`
              : `${isDark ? 'bg-slate-800/40 text-slate-400 hover:bg-slate-800/60' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
          }`}
          style={activeTab === 'agent' ? {
            background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primary}CC)`,
            boxShadow: `0 4px 20px ${HAVEN_COLORS.primary}40`
          } : {}}
        >
          <Bot className="inline h-5 w-5 mr-2" />
          Create AI Agent
        </button>
        <button
          type="button"
          disabled
          className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-300 cursor-not-allowed opacity-50 ${
            isDark ? 'bg-slate-800/40 text-slate-500' : 'bg-gray-100 text-gray-500'
          }`}
        >
          <Usb className="inline h-5 w-5 mr-2" />
          Load Virtual USB
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        {/* Left Column - Form */}
        <div className="space-y-4">

          {/* Basic Information */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01]`}
                style={{boxShadow: `0 0 20px ${HAVEN_COLORS.primary}15`}}>
            <CardHeader className="p-4">
              <CardTitle className={`flex items-center gap-2 text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <Bot className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
                <span>Basic Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {/* 2-column grid for Name & Ticker */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Name <span style={{color: HAVEN_COLORS.primary}}>({formData.name.length}/30)</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder={activeTab === 'agent' ? 'Agent Name' : 'Robot Name'}
                    className={`w-full px-3 py-2 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.01] ${
                      isDark
                        ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    style={{
                      boxShadow: `0 0 10px ${HAVEN_COLORS.primary}15`,
                      borderColor: HAVEN_COLORS.primary + '40'
                    }}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Ticker <span style={{color: HAVEN_COLORS.primary}}>({formData.ticker.length}/12)</span>
                  </label>
                  <input
                    type="text"
                    name="ticker"
                    value={formData.ticker}
                    onChange={handleInputChange}
                    placeholder={activeTab === 'agent' ? 'AGENT' : 'ROBOT'}
                    className={`w-full px-3 py-2 border rounded-xl uppercase text-sm transition-all duration-300 focus:outline-none focus:scale-[1.01] ${
                      isDark
                        ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    style={{
                      boxShadow: `0 0 10px ${HAVEN_COLORS.primary}15`,
                      borderColor: HAVEN_COLORS.primary + '40'
                    }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Description <span style={{color: HAVEN_COLORS.primary}}>({formData.description.length}/200)</span>
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder={activeTab === 'agent' ? 'Describe your agent...' : 'Describe your robot...'}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-xl resize-none text-sm transition-all duration-300 focus:outline-none focus:scale-[1.01] ${
                    isDark
                      ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  style={{
                    boxShadow: `0 0 10px ${HAVEN_COLORS.primary}15`,
                    borderColor: HAVEN_COLORS.primary + '40'
                  }}
                />
              </div>

              {/* Initial Buy Amount (Optional) */}
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Initial {getMaxInitialBuy().symbol} Buy <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>(Optional, max {getMaxInitialBuy().amount})</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="initialBuyXToken"
                    value={formData.initialBuyXToken}
                    onChange={handleInputChange}
                    placeholder="0.0"
                    className={`w-full px-3 py-2 pr-24 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${
                      isDark
                        ? 'bg-transparent border-slate-600 text-white placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    style={{
                      boxShadow: `0 0 10px ${HAVEN_COLORS.success}15`,
                      borderColor: HAVEN_COLORS.success + '40'
                    }}
                  />
                  <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold px-1.5 py-0.5 rounded-lg`}
                        style={{
                          backgroundColor: `${HAVEN_COLORS.success}20`,
                          color: HAVEN_COLORS.success
                        }}>
                    Bal: {(() => {
                      const num = parseFloat(xTokenBalance)
                      if (!Number.isFinite(num)) return '0'
                      if (num >= 1_000_000) return `${Math.round(num/1_000_000)}M`
                      if (num >= 1_000) return `${Math.round(num/1_000)}k`
                      return `${Math.round(num*1000)/1000}`
                    })()}
                  </span>
                </div>
              </div>

              {/* Creator Allocation (Optional) */}
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Creator Allocation <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>(0-5%)</span>
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.1"
                      value={formData.creatorAllocationPercent}
                      onChange={(e) => setFormData({...formData, creatorAllocationPercent: parseFloat(e.target.value)})}
                      className="flex-1 mr-3"
                      style={{
                        accentColor: HAVEN_COLORS.primary
                      }}
                    />
                    <div className={`text-sm font-bold px-3 py-1 rounded-lg min-w-[60px] text-center`}
                         style={{
                           backgroundColor: `${HAVEN_COLORS.primary}20`,
                           color: HAVEN_COLORS.primary
                         }}>
                      {(formData.creatorAllocationPercent || 0).toFixed(1)}%
                    </div>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    {(formData.creatorAllocationPercent || 0) === 0
                      ? 'No tokens allocated to creator'
                      : `Creator receives ${(formData.creatorAllocationPercent || 0).toFixed(1)}% of initial supply (${(900000 * (formData.creatorAllocationPercent || 0) / 100).toLocaleString()} tokens)`
                    }
                  </p>
                </div>
              </div>

            </CardContent>
          </Card>

        {/* Advanced Options (Optional) - Collapsed by default */}
        <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01]`}
              style={{boxShadow: showAdvancedOptions ? `0 0 25px ${HAVEN_COLORS.warning}20` : `0 0 15px ${HAVEN_COLORS.primary}10`}}>
          <CardHeader className="cursor-pointer hover:bg-white/5 transition-all duration-300 p-4" onClick={() => setShowAdvancedOptions(v => !v)}>
            <CardTitle className={`flex items-center justify-between text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <span className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" style={{color: HAVEN_COLORS.warning}} />
                Advanced Options
                <span className={`text-xs px-1.5 py-0.5 rounded-full`}
                      style={{backgroundColor: `${HAVEN_COLORS.warning}20`, color: HAVEN_COLORS.warning}}>
                  Optional
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showAdvancedOptions ? 'rotate-180' : ''}`}
                           style={{color: HAVEN_COLORS.warning}} />
            </CardTitle>
          </CardHeader>
          <CardContent className={`${showAdvancedOptions ? 'space-y-3' : 'hidden'} transition-all p-4 pt-0`}>
            {/* Compact 2x2 grid for advanced fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Detailed Description */}
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Detailed Description <span style={{color: advDetailed.length >= 300 ? HAVEN_COLORS.success : HAVEN_COLORS.warning}}>({advDetailed.length}/300)</span>
                </label>
                <textarea
                  value={advDetailed}
                  onChange={(e) => setAdvDetailed(e.target.value)}
                  rows={3}
                  placeholder="Detailed description..."
                  className={`w-full px-3 py-2 border rounded-xl resize-none text-sm transition-all duration-300 focus:outline-none focus:scale-[1.01] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  style={{
                    boxShadow: `0 0 10px ${HAVEN_COLORS.warning}15`,
                    borderColor: HAVEN_COLORS.warning + '40'
                  }}
                />
              </div>

              {/* How it works */}
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  How it works <span style={{color: advHowItWorks.length >= 300 ? HAVEN_COLORS.success : HAVEN_COLORS.warning}}>({advHowItWorks.length}/300)</span>
                </label>
                <textarea
                  value={advHowItWorks}
                  onChange={(e) => setAdvHowItWorks(e.target.value)}
                  rows={3}
                  placeholder="How it works..."
                  className={`w-full px-3 py-2 border rounded-xl resize-none text-sm transition-all duration-300 focus:outline-none focus:scale-[1.01] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  style={{
                    boxShadow: `0 0 10px ${HAVEN_COLORS.warning}15`,
                    borderColor: HAVEN_COLORS.warning + '40'
                  }}
                />
              </div>

              {/* Roadmap */}
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  Roadmap <span style={{color: advRoadmap.length >= 150 ? HAVEN_COLORS.success : HAVEN_COLORS.warning}}>({advRoadmap.length}/150)</span>
                </label>
                <textarea
                  value={advRoadmap}
                  onChange={(e) => setAdvRoadmap(e.target.value)}
                  rows={3}
                  placeholder="Roadmap..."
                  className={`w-full px-3 py-2 border rounded-xl resize-none text-sm transition-all duration-300 focus:outline-none focus:scale-[1.01] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  style={{
                    boxShadow: `0 0 10px ${HAVEN_COLORS.warning}15`,
                    borderColor: HAVEN_COLORS.warning + '40'
                  }}
                />
              </div>

              {/* About Team */}
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  About Team <span style={{color: advAboutTeam.length >= 200 ? HAVEN_COLORS.success : HAVEN_COLORS.warning}}>({advAboutTeam.length}/200)</span>
                </label>
                <textarea
                  value={advAboutTeam}
                  onChange={(e) => setAdvAboutTeam(e.target.value)}
                  rows={3}
                  placeholder="About the team..."
                  className={`w-full px-3 py-2 border rounded-xl resize-none text-sm transition-all duration-300 focus:outline-none focus:scale-[1.01] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                  style={{
                    boxShadow: `0 0 10px ${HAVEN_COLORS.warning}15`,
                    borderColor: HAVEN_COLORS.warning + '40'
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Robot Visibility */}
        <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01]`}
              style={{boxShadow: `0 0 15px ${HAVEN_COLORS.primary}10`}}>
          <CardHeader className="p-4">
            <CardTitle className={`flex items-center gap-2 text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <Globe className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
              {activeTab === 'agent' ? 'Agent Visibility' : 'Robot Visibility'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="relative group">
                  <div className={`h-4 w-4 rounded-full flex items-center justify-center cursor-help`}
                       style={{backgroundColor: `${HAVEN_COLORS.primary}20`}}>
                    <span className={`text-xs font-bold`} style={{color: HAVEN_COLORS.primary}}>?</span>
                  </div>
                  <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-lg text-xs w-64 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 ${isDark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-white text-gray-700 border border-gray-200 shadow-lg'}`}>
                    Public: all users access the same simulation. Private: each user gets their own simulation.
                  </div>
                </div>
                <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                  Choose how users interact with your robot agent
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsGlobal(true)}
                  className={`p-3 border-2 rounded-xl cursor-pointer transition-all duration-300 hover:scale-[1.02]`}
                  style={{
                    borderColor: isGlobal ? HAVEN_COLORS.primary : HAVEN_COLORS.primary + '40',
                    backgroundColor: isGlobal ? `${HAVEN_COLORS.primary}15` : `${HAVEN_COLORS.primary}05`,
                    boxShadow: isGlobal ? `0 0 15px ${HAVEN_COLORS.primary}30` : 'none'
                  }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Globe className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
                    <span className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>Public</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setIsGlobal(false)}
                  className={`p-3 border-2 rounded-xl cursor-pointer transition-all duration-300 hover:scale-[1.02]`}
                  style={{
                    borderColor: !isGlobal ? HAVEN_COLORS.primary : HAVEN_COLORS.primary + '40',
                    backgroundColor: !isGlobal ? `${HAVEN_COLORS.primary}15` : `${HAVEN_COLORS.primary}05`,
                    boxShadow: !isGlobal ? `0 0 15px ${HAVEN_COLORS.primary}30` : 'none'
                  }}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Lock className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
                    <span className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>Private</span>
                  </div>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

          {/* Environment (collapsible) - Collapsed by default */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01]`}
                style={{boxShadow: showEnv ? `0 0 25px ${HAVEN_COLORS.primary}20` : `0 0 15px ${HAVEN_COLORS.primary}10`}}>
            <CardHeader className="cursor-pointer hover:bg-white/5 transition-all duration-300 p-4" onClick={() => {
              setShowEnv(v => !v);
              // Only load environment options for robot tab, not agent tab
              if (!showEnv && activeTab === 'robot') loadEnvironmentOptions()
            }}>
              <CardTitle className={`flex items-center justify-between text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <span className="flex items-center gap-2">
                  <Globe className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
                  Environment
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showEnv ? 'rotate-180' : ''}`}
                             style={{color: HAVEN_COLORS.primary}} />
              </CardTitle>
            </CardHeader>
            <CardContent className={`${showEnv ? 'space-y-3' : 'hidden'} transition-all p-4 pt-0`}>
              {activeTab === 'agent' ? (
                <>
              {/* AGENT TAB - Clear any robot defaults immediately */}
              {(() => {
                // Clear gamerules if it's a robot default value
                if (formData.gamerules && (formData.gamerules.startsWith('game_sim') || formData.gamerules.startsWith('sim_type'))) {
                  setTimeout(() => setFormData(prev => ({ ...prev, gamerules: '' })), 0)
                }
                return null
              })()}
              {/* Model select - AGENT TAB ONLY */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className={`block text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Model
                  </label>
                  <div className="relative group">
                    <div className={`h-4 w-4 rounded-full flex items-center justify-center cursor-help`}
                         style={{backgroundColor: `${HAVEN_COLORS.primary}20`}}>
                      <span className={`text-xs font-bold`} style={{color: HAVEN_COLORS.primary}}>?</span>
                    </div>
                    <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-lg text-xs w-64 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 ${isDark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-white text-gray-700 border border-gray-200 shadow-lg'}`}>
                      Select an AI model to power your robot agent's intelligence
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <select
                    value={selectedBrain}
                    onChange={(e) => setSelectedBrain(e.target.value)}
                    disabled={brainLoading || brainOptions.length === 0}
                    className={`w-full appearance-none px-4 py-3 border-2 rounded-xl text-sm font-medium transition-all duration-300 focus:outline-none focus:scale-[1.01] cursor-pointer ${isDark ? 'bg-slate-800/60 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    style={{
                      boxShadow: `0 0 10px ${HAVEN_COLORS.primary}15`,
                      borderColor: HAVEN_COLORS.primary + '40',
                      paddingRight: '2.5rem'
                    }}
                  >
                    <option value="" className={isDark ? 'bg-slate-800' : 'bg-white'}>
                      {brainLoading ? '⏳ Loading model options...' : brainOptions.length === 0 ? '❌ No model options available' : '💭 Select a model'}
                    </option>
                    {brainOptions.map((brain, index) => {
                      // Handle both object format { id, name } and legacy string format
                      const brainId = brain.id || index.toString()
                      const brainName = brain.name || brain
                      const [provider, model] = brainName.split('/')
                      const displayName = model
                        ? `${provider.charAt(0).toUpperCase() + provider.slice(1)} - ${model}`
                        : brainName
                      return (
                        <option
                          key={brainId}
                          value={brainId}
                          className={isDark ? 'bg-slate-800 text-white py-2' : 'bg-white text-gray-900 py-2'}
                        >
                          {displayName}
                        </option>
                      )
                    })}
                  </select>
                  <ChevronDown
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 pointer-events-none"
                    style={{color: HAVEN_COLORS.primary}}
                  />
                </div>
                {selectedBrain && (
                  <div className={`mt-2 p-2 rounded-lg text-xs ${isDark ? 'bg-slate-800/40 text-slate-400' : 'bg-gray-50 text-gray-600'}`}>
                    <span className="font-semibold" style={{color: HAVEN_COLORS.primary}}>Selected:</span> {selectedBrain}
                  </div>
                )}
              </div>

              {/* Personality input - Compact */}
              <div className="space-y-1.5">
                <label className={`block text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Personality</label>
                <textarea
                  name="gamerules"
                  value={formData.gamerules || ''}
                  onChange={handleInputChange}
                  placeholder="Describe your robot agent's personality... (e.g., 'Friendly and helpful', 'Analytical and precise', 'Creative and adventurous')"
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.01] resize-none ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                  style={{
                    boxShadow: `0 0 10px ${HAVEN_COLORS.primary}15`,
                    borderColor: HAVEN_COLORS.primary + '40'
                  }}
                  disabled={envLoading}
                />
                {/* Create Environment Button */}
                <button
                  type="button"
                  onClick={createEnvironment}
                  disabled={creatingEnvironment || !selectedBrain || !formData.gamerules}
                  className={`w-full px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'text-white' : 'text-white'}`}
                  style={{
                    background: creatingEnvironment ? `${HAVEN_COLORS.primary}80` : `linear-gradient(135deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.primaryHover})`,
                    boxShadow: `0 4px 15px ${HAVEN_COLORS.primary}40`
                  }}
                >
                  {creatingEnvironment ? (
                    <>
                      <Sparkles className="inline h-4 w-4 mr-2 animate-spin" />
                      Creating Environment...
                    </>
                  ) : createdEnvironment ? (
                    <>
                      ✅ Environment Created
                    </>
                  ) : (
                    <>
                      <Plus className="inline h-4 w-4 mr-2" />
                      Create Environment
                    </>
                  )}
                </button>
                {createdEnvironment && (
                  <div className={`p-2 rounded-lg text-xs ${isDark ? 'bg-green-900/20 text-green-400 border border-green-700/50' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                    <span className="font-semibold">✓ Environment ready!</span> Brain: {getBrainDisplayName(createdEnvironment.brain_id)}
                  </div>
                )}
              </div>
                </>
              ) : (
                <>
              {/* Brain/Model select - ROBOT TAB */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className={`block text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    AI Brain (Optional)
                  </label>
                  <div className="relative group">
                    <div className={`h-4 w-4 rounded-full flex items-center justify-center cursor-help`}
                         style={{backgroundColor: `${HAVEN_COLORS.primary}20`}}>
                      <span className={`text-xs font-bold`} style={{color: HAVEN_COLORS.primary}}>?</span>
                    </div>
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
                    className={`w-full appearance-none px-4 py-3 border-2 rounded-xl text-sm font-medium transition-all duration-300 focus:outline-none focus:scale-[1.01] cursor-pointer ${isDark ? 'bg-slate-800/60 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    style={{
                      boxShadow: `0 0 10px ${HAVEN_COLORS.primary}15`,
                      borderColor: HAVEN_COLORS.primary + '40',
                      paddingRight: '2.5rem'
                    }}
                  >
                    <option value="" className={isDark ? 'bg-slate-800' : 'bg-white'}>
                      {brainLoading ? '⏳ Loading models...' : brainOptions.length === 0 ? '❌ No models available' : '💭 None (Standard Simulation)'}
                    </option>
                    {brainOptions.map((brain, index) => {
                      // Handle both object format { id, name } and legacy string format
                      const brainId = brain.id || index.toString()
                      const brainName = brain.name || brain
                      const [provider, model] = brainName.split('/')
                      const displayName = model
                        ? `${provider.charAt(0).toUpperCase() + provider.slice(1)} - ${model}`
                        : brainName
                      return (
                        <option
                          key={brainId}
                          value={brainId}
                          className={isDark ? 'bg-slate-800 text-white py-2' : 'bg-white text-gray-900 py-2'}
                        >
                          {displayName}
                        </option>
                      )
                    })}
                  </select>
                  <ChevronDown
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 pointer-events-none"
                    style={{color: HAVEN_COLORS.primary}}
                  />
                </div>
                {selectedBrain && (
                  <div className={`mt-2 p-2 rounded-lg text-xs ${isDark ? 'bg-slate-800/40 text-slate-400' : 'bg-gray-50 text-gray-600'}`}>
                    <span className="font-semibold" style={{color: HAVEN_COLORS.primary}}>Selected:</span> {selectedBrain}
                  </div>
                )}
              </div>

              {/* Sim Type select - ROBOT TAB ONLY */}
              <div className="space-y-1.5">
                <label className={`block text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Sim Type</label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <select
                      name="sim_type"
                      value={formData.sim_type}
                      onChange={handleInputChange}
                      className={`w-full appearance-none pr-8 px-3 py-2 border rounded-xl cursor-pointer text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${isDark ? 'bg-transparent border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                      style={{
                        boxShadow: `0 0 10px ${HAVEN_COLORS.primary}15`,
                        borderColor: HAVEN_COLORS.primary + '40'
                      }}
                      disabled={envLoading}
                    >
                      {envLoading ? (
                        <option>Loading...</option>
                      ) : Object.keys(simTypeOptions).length === 0 ? (
                        <option>No sim types available</option>
                      ) : (
                        <>
                          <option value="">Select Sim Type</option>
                          {Object.keys(simTypeOptions).map((key) => (
                            <option key={key} value={key} className={isDark ? 'bg-slate-800' : 'bg-white'}>{key}</option>
                          ))}
                        </>
                      )}
                    </select>
                    <ChevronDown className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4`}
                                 style={{color: HAVEN_COLORS.primary}} />
                  </div>
                  <Button type="button" variant="ghost" onClick={() => setShowSimDetails(v => !v)} className={`${isDark ? 'text-slate-400 hover:bg-slate-800/60' : 'text-gray-600 hover:bg-gray-100'} h-8 px-2 rounded-lg`}>{showSimDetails ? '👁️' : '👁️‍🗨️'}</Button>
                </div>
                {(() => {
                  const cfg = simTypeOptions[formData.sim_type] || {}
                  const commands = Array.isArray(cfg.command_list) ? cfg.command_list.length : 0
                  const status = cfg.status || {}
                  const size = Array.isArray(status.size) ? status.size.join('×') : '—'
                  const sensorsCount = status.sensors ? Object.keys(status.sensors).length : 0
                  return (
                    <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      Cmds: {commands} · Size: {size} · Sensors: {sensorsCount}
                    </div>
                  )
                })()}
                {showSimDetails && (
                  <pre className={`${isDark ? 'bg-slate-900/60 text-slate-200' : 'bg-gray-50 text-gray-800'} text-xs p-3 rounded-xl overflow-auto max-h-40 border ${isDark ? 'border-slate-700/60' : 'border-gray-200'}`}>{JSON.stringify(simTypeOptions[formData.sim_type] || {}, null, 2)}</pre>
                )}
              </div>

              {/* Game Rules - ROBOT TAB */}
              <div className="space-y-1.5">
                <label className={`block text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Game Rules</label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <select
                      name="gamerules"
                      value={formData.gamerules}
                      onChange={handleInputChange}
                      className={`w-full appearance-none pr-8 px-3 py-2 border rounded-xl cursor-pointer text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${isDark ? 'bg-transparent border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                      style={{
                        boxShadow: `0 0 10px ${HAVEN_COLORS.primary}15`,
                        borderColor: HAVEN_COLORS.primary + '40'
                      }}
                      disabled={envLoading}
                    >
                      {envLoading ? (
                        <option>Loading...</option>
                      ) : Object.keys(gameSimOptions).length === 0 ? (
                        <option>No game rules available</option>
                      ) : (
                        <>
                          <option value="">Select Game Rules</option>
                          {Object.keys(gameSimOptions).map((key) => (
                            <option key={key} value={key} className={isDark ? 'bg-slate-800' : 'bg-white'}>{key}</option>
                          ))}
                        </>
                      )}
                    </select>
                    <ChevronDown className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4`}
                                 style={{color: HAVEN_COLORS.primary}} />
                  </div>
                  <Button type="button" variant="ghost" onClick={() => setShowGameDetails(v => !v)} className={`${isDark ? 'text-slate-400 hover:bg-slate-800/60' : 'text-gray-600 hover:bg-gray-100'} h-8 px-2 rounded-lg`}>{showGameDetails ? '👁️' : '👁️‍🗨️'}</Button>
                </div>
                {showGameDetails && (
                  <pre className={`${isDark ? 'bg-slate-900/60 text-slate-200' : 'bg-gray-50 text-gray-800'} text-xs p-3 rounded-xl overflow-auto max-h-40 border ${isDark ? 'border-slate-700/60' : 'border-gray-200'}`}>{JSON.stringify(gameSimOptions[formData.gamerules] || {}, null, 2)}</pre>
                )}
              </div>
                </>
              )}

              {/* Custom environments controls - Compact */}
              <div className="pt-3 flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    if (showMyEnvs) {
                      setShowMyEnvs(false)
                    } else {
                      loadMyCustomEnvs()
                    }
                  }}
                  className={`h-9 flex-1 rounded-xl border text-sm font-semibold transition-all duration-300 hover:scale-[1.02] ${isDark ? 'border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60' : 'border-gray-200 bg-white/80 text-gray-900 hover:bg-white'} flex items-center justify-between px-3`}
                  style={{
                    boxShadow: `0 0 15px ${HAVEN_COLORS.primary}15`,
                    borderColor: HAVEN_COLORS.primary + '40'
                  }}
                >
                  <span>My Envs</span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showMyEnvs ? 'rotate-180' : ''}`}
                               style={{color: HAVEN_COLORS.primary}} />
                </Button>
                {activeTab === 'robot' && (
                  <Button
                    type="button"
                    onClick={() => setOpenEnvWizard(true)}
                    className="h-9 w-9 rounded-full transition-all duration-300 hover:scale-110 p-0 flex items-center justify-center animate-pulse hover:animate-none"
                    style={{
                      background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.success})`,
                      color: 'white',
                      boxShadow: `0 4px 15px ${HAVEN_COLORS.primary}40`
                    }}
                    title="Create custom environment"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                )}
              </div>

              {showMyEnvs && (
                <div className={`mt-3 rounded-2xl border shadow-xl animate-in slide-in-from-top duration-300 ${isDark ? 'border-slate-700/60 bg-slate-900/60' : 'border-gray-200 bg-white/80 backdrop-blur-md'} p-3 space-y-3`}
                     style={{boxShadow: `0 0 25px ${HAVEN_COLORS.primary}20`}}>
                  <div className="flex items-center justify-between">
                    <div className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>Your Environments</div>
                    <Button type="button" variant="ghost" onClick={() => setShowMyEnvs(false)} className={`${isDark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-600 hover:bg-gray-100'} h-7 px-2 rounded-lg transition-all duration-300 hover:scale-110`}>
                      <ChevronDown className="h-4 w-4 rotate-180" />
                    </Button>
                  </div>
                  {myEnvsLoading ? (
                    <div className={`${isDark ? 'text-slate-400' : 'text-gray-600'} text-xs`}>Loading...</div>
                  ) : activeTab === 'agent' ? (
                    // Agent tab: Show agent pairs (model + personality)
                    !myEnvs?.agentPairs?.length ? (
                      <div className={`${isDark ? 'text-slate-400' : 'text-gray-600'} text-xs`}>No agent environments found</div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Agent Environments</div>
                        <div className="space-y-1.5">
                          {myEnvs.agentPairs.map((agent, idx) => {
                            const isSelected = selectedBrain === agent.brain_id && formData.gamerules === agent.status
                            return (
                              <div key={idx} className={`flex items-center justify-between rounded-xl border px-3 py-2 shadow-sm transition-all duration-300 hover:scale-[1.02] ${isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-gray-200 bg-white/90 backdrop-blur'}`}
                                   style={{
                                     borderColor: isSelected ? HAVEN_COLORS.primary : undefined,
                                     boxShadow: isSelected ? `0 0 15px ${HAVEN_COLORS.primary}30` : undefined
                                   }}>
                                <div className={`flex flex-col gap-0.5 flex-1`}>
                                  <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {getBrainDisplayName(agent.brain_id)} {isSelected && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full`}
                                                                          style={{backgroundColor: `${HAVEN_COLORS.primary}20`, color: HAVEN_COLORS.primary}}>
                                      ✓
                                    </span>}
                                  </div>
                                  <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                    {agent.status}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Button type="button" variant="outline" className={`h-7 rounded-lg px-2 text-xs font-semibold transition-all duration-300 hover:scale-110 ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                          style={{borderColor: HAVEN_COLORS.success + '40'}}
                                          onClick={() => {
                                            setSelectedBrain(agent.brain_id)
                                            setFormData(prev => ({ ...prev, gamerules: agent.status }))
                                            setShowMyEnvs(true)
                                          }}>Use</Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  ) : (
                    // Robot tab: Show sim types and game rules separately
                    (!myEnvs?.simTypes?.length && !myEnvs?.gameSims?.length) ? (
                      <div className={`${isDark ? 'text-slate-400' : 'text-gray-600'} text-xs`}>No environments found</div>
                    ) : (
                      <div className="space-y-3">
                        {/* Sim Types - ROBOT TAB */}
                        {myEnvs?.simTypes?.length ? (
                          <div className="space-y-1.5">
                            <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Sim Types</div>
                            <div className="space-y-1.5">
                              {myEnvs.simTypes.map((simId) => {
                                const isSelected = formData.sim_type === simId
                                return (
                                <div key={simId} className={`flex items-center justify-between rounded-xl border px-3 py-2 shadow-sm transition-all duration-300 hover:scale-[1.02] ${isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-gray-200 bg-white/90 backdrop-blur'}`}
                                     style={{
                                       borderColor: isSelected ? HAVEN_COLORS.primary : undefined,
                                       boxShadow: isSelected ? `0 0 15px ${HAVEN_COLORS.primary}30` : undefined
                                     }}>
                                  <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {simId} {isSelected && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full`}
                                                                 style={{backgroundColor: `${HAVEN_COLORS.primary}20`, color: HAVEN_COLORS.primary}}>
                                      ✓
                                    </span>}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Button type="button" variant="outline" className={`h-7 rounded-lg px-2 text-xs font-semibold transition-all duration-300 hover:scale-110 ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`} onClick={async () => {
                                      try {
                                        const res = await fetch('/api/robot/robots/default-sims')
                                        const json = await res.json().catch(() => null)
                                        const cfg = json?.default_sim_types?.[simId] || null
                                        setEditModal({ open: true, target: 'sim', id: simId, config: cfg })
                                      } catch { setEditModal({ open: true, target: 'sim', id: simId, config: null }) }
                                    }}>Edit</Button>
                                    <Button type="button" variant="outline" className={`h-7 rounded-lg px-2 text-xs font-semibold transition-all duration-300 hover:scale-110 ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                            style={{borderColor: HAVEN_COLORS.success + '40'}}
                                            onClick={() => { setFormData(prev => ({ ...prev, sim_type: simId })); setShowMyEnvs(true) }}>Use</Button>
                                  </div>
                                </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        {/* Game Rules - ROBOT TAB */}
                        {myEnvs?.gameSims?.length ? (
                          <div className="space-y-1.5">
                            <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Game Rules</div>
                            <div className="space-y-1.5">
                              {myEnvs.gameSims.map((gameId) => {
                                const isSelected = formData.gamerules === gameId
                                return (
                                <div key={gameId} className={`flex items-center justify-between rounded-xl border px-3 py-2 shadow-sm transition-all duration-300 hover:scale-[1.02] ${isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-gray-200 bg-white/90 backdrop-blur'}`}
                                     style={{
                                       borderColor: isSelected ? HAVEN_COLORS.primary : undefined,
                                       boxShadow: isSelected ? `0 0 15px ${HAVEN_COLORS.primary}30` : undefined
                                     }}>
                                  <div className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {gameId} {isSelected && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full`}
                                                                  style={{backgroundColor: `${HAVEN_COLORS.primary}20`, color: HAVEN_COLORS.primary}}>
                                      ✓
                                    </span>}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Button type="button" variant="outline" className={`h-7 rounded-lg px-2 text-xs font-semibold transition-all duration-300 hover:scale-110 ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`} onClick={async () => {
                                      try {
                                        const res = await fetch('/api/robot/robots/default-gamesims')
                                        const json = await res.json().catch(() => null)
                                        const cfg = json?.default_game_sims?.[gameId] || null
                                        setEditModal({ open: true, target: 'game', id: gameId, config: cfg })
                                      } catch { setEditModal({ open: true, target: 'game', id: gameId, config: null }) }
                                    }}>Edit</Button>
                                    <Button type="button" variant="outline" className={`h-7 rounded-lg px-2 text-xs font-semibold transition-all duration-300 hover:scale-110 ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                            style={{borderColor: HAVEN_COLORS.success + '40'}}
                                            onClick={() => { setFormData(prev => ({ ...prev, gamerules: gameId })); setShowMyEnvs(true) }}>Use</Button>
                                  </div>
                                </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add social links (Optional) - collapsible (left column on mobile only) - Compact & Collapsed */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01] lg:hidden`}
                style={{boxShadow: showSocial ? `0 0 25px ${HAVEN_COLORS.success}20` : `0 0 15px ${HAVEN_COLORS.primary}10`}}>
            <CardHeader className="cursor-pointer hover:bg-white/5 transition-all duration-300 p-4" onClick={() => setShowSocial(v => !v)}>
              <CardTitle className={`flex items-center justify-between text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <span className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" style={{color: HAVEN_COLORS.success}} />
                  Social Links
                  <span className={`text-xs px-1.5 py-0.5 rounded-full`}
                        style={{backgroundColor: `${HAVEN_COLORS.success}20`, color: HAVEN_COLORS.success}}>
                    Optional
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showSocial ? 'rotate-180' : ''}`}
                             style={{color: HAVEN_COLORS.success}} />
              </CardTitle>
            </CardHeader>
            <CardContent className={`${showSocial ? 'space-y-3' : 'hidden'} transition-all p-4 pt-0`}>
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <Globe className="inline h-4 w-4 mr-1" />
                  Website
                </label>
                <input type="url" name="website" value={formData.website} onChange={handleInputChange} placeholder={activeTab === 'agent' ? 'https://youragent.com' : 'https://yourrobot.com'}
                       className={`w-full px-3 py-2 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                       style={{
                         boxShadow: `0 0 10px ${HAVEN_COLORS.success}15`,
                         borderColor: HAVEN_COLORS.success + '40'
                       }} />
              </div>
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <Twitter className="inline h-4 w-4 mr-1" />
                  Twitter
                </label>
                <input type="url" name="twitter" value={formData.twitter} onChange={handleInputChange} placeholder={activeTab === 'agent' ? 'https://twitter.com/youragent' : 'https://twitter.com/yourrobot'}
                       className={`w-full px-3 py-2 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                       style={{
                         boxShadow: `0 0 10px ${HAVEN_COLORS.success}15`,
                         borderColor: HAVEN_COLORS.success + '40'
                       }} />
              </div>
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <MessageCircle className="inline h-4 w-4 mr-1" />
                  Telegram
                </label>
                <input type="url" name="telegram" value={formData.telegram} onChange={handleInputChange} placeholder={activeTab === 'agent' ? 'https://t.me/youragent' : 'https://t.me/yourrobot'}
                       className={`w-full px-3 py-2 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                       style={{
                         boxShadow: `0 0 10px ${HAVEN_COLORS.success}15`,
                         borderColor: HAVEN_COLORS.success + '40'
                       }} />
              </div>
            </CardContent>
          </Card>

          {/* Connection Type (collapsible) - left column on mobile only - Compact & Collapsed */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01] lg:hidden`}
                style={{boxShadow: showConnection ? `0 0 25px ${HAVEN_COLORS.primary}20` : `0 0 15px ${HAVEN_COLORS.primary}10`}}>
            <CardHeader className="cursor-pointer hover:bg-white/5 transition-all duration-300 p-4" onClick={() => setShowConnection(v => !v)}>
              <CardTitle className={`flex items-center justify-between text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <span className="flex items-center gap-2">
                  <Usb className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
                  Connection Type
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showConnection ? 'rotate-180' : ''}`}
                             style={{color: HAVEN_COLORS.primary}} />
              </CardTitle>
            </CardHeader>
            <CardContent className={`${showConnection ? 'space-y-3' : 'hidden'} transition-all p-4 pt-0`}>
              {/* Simulation Option - Compact */}
              <div
                className={`p-3 border-2 rounded-xl cursor-pointer transition-all duration-300 hover:scale-[1.02]`}
                style={{
                  borderColor: formData.connection_type === 'simulation' ? HAVEN_COLORS.primary : HAVEN_COLORS.primary + '40',
                  backgroundColor: formData.connection_type === 'simulation' ? `${HAVEN_COLORS.primary}15` : `${HAVEN_COLORS.primary}05`,
                  boxShadow: formData.connection_type === 'simulation' ? `0 0 15px ${HAVEN_COLORS.primary}30` : 'none'
                }}
                onClick={() => setFormData(prev => ({ ...prev, connection_type: 'simulation' }))}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2`}
                       style={{
                         borderColor: formData.connection_type === 'simulation' ? HAVEN_COLORS.primary : HAVEN_COLORS.primary + '60',
                         backgroundColor: formData.connection_type === 'simulation' ? HAVEN_COLORS.primary : 'transparent'
                       }}>
                    {formData.connection_type === 'simulation' && (
                      <div className="w-full h-full rounded-full bg-white scale-50"></div>
                    )}
                  </div>
                  <div>
                    <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} font-bold text-sm`}>
                      {activeTab === 'agent' ? 'Language Learning Model' : 'Digital Twin Simulation'}
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      {activeTab === 'agent' ? 'Terminal simulation' : 'Virtual robot simulation'}
                    </p>
                  </div>
                </div>
              </div>

              {/* USB Option - Disabled - Compact (hidden on Agent tab) */}
              {activeTab === 'robot' && (
              <div className={`p-3 border-2 rounded-xl opacity-50 cursor-not-allowed`}
                   style={{
                     borderColor: HAVEN_COLORS.primary + '20',
                     backgroundColor: `${HAVEN_COLORS.primary}03`
                   }}>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2`}
                       style={{borderColor: HAVEN_COLORS.primary + '30'}}></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className={`${isDark ? 'text-slate-300' : 'text-gray-700'} font-bold text-sm`}>Physical USB Connection</h3>
                      <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full`}
                           style={{backgroundColor: `${HAVEN_COLORS.warning}20`}}>
                        <Lock className={`h-3 w-3`} style={{color: HAVEN_COLORS.warning}} />
                        <span className={`text-xs font-semibold`} style={{color: HAVEN_COLORS.warning}}>Soon</span>
                      </div>
                    </div>
                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>
                      Connect real hardware
                    </p>
                  </div>
                </div>
              </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Compact Image Upload & Preview */}
        <div className="space-y-4">
          {/* Image Upload - Compact */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01]`}
                style={{boxShadow: `0 0 20px ${HAVEN_COLORS.primary}15`}}>
            <CardHeader className="p-4">
              <CardTitle className={`flex items-center gap-2 text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <Image className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
                <span>{activeTab === 'agent' ? 'Agent Image' : 'Robot Image'}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {/* Image Upload Area - Compact & Cute */}
              <div
                className={`relative border-2 border-dashed rounded-2xl p-4 text-center transition-all duration-300 cursor-pointer ${
                  dragActive
                    ? 'scale-105'
                    : 'hover:scale-[1.02]'
                }`}
                style={{
                  borderColor: dragActive ? HAVEN_COLORS.primary : HAVEN_COLORS.primary + '40',
                  backgroundColor: dragActive ? `${HAVEN_COLORS.primary}15` : `${HAVEN_COLORS.primary}05`,
                  boxShadow: dragActive ? `0 0 25px ${HAVEN_COLORS.primary}30` : `0 0 10px ${HAVEN_COLORS.primary}10`
                }}
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
                  <div className="space-y-2">
                    <img
                      src={imagePreview}
                      alt={activeTab === 'agent' ? 'Agent preview' : 'Robot preview'}
                      className="w-full h-32 object-cover rounded-xl mx-auto transition-transform duration-300 hover:scale-105"
                      style={{
                        border: `2px solid ${HAVEN_COLORS.primary}`,
                        boxShadow: `0 0 20px ${HAVEN_COLORS.primary}40`
                      }}
                    />
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Click or drag to change</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className={`h-8 w-8 mx-auto animate-bounce`} style={{color: HAVEN_COLORS.primary}} />
                    <div>
                      <p className={`${isDark ? 'text-white' : 'text-gray-900'} font-bold text-sm`}>Upload Image</p>
                      <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Drag & drop or click</p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-500'}`}>PNG, JPG up to 10MB</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

        {/* Add social links (Optional) - shown on desktop in right column - Compact & Collapsed */}
        <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01] hidden lg:block`}
              style={{boxShadow: showSocial ? `0 0 25px ${HAVEN_COLORS.success}20` : `0 0 15px ${HAVEN_COLORS.primary}10`}}>
          <CardHeader className="cursor-pointer hover:bg-white/5 transition-all duration-300 p-4" onClick={() => setShowSocial(v => !v)}>
            <CardTitle className={`flex items-center justify-between text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <span className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" style={{color: HAVEN_COLORS.success}} />
                Social Links
                <span className={`text-xs px-1.5 py-0.5 rounded-full`}
                      style={{backgroundColor: `${HAVEN_COLORS.success}20`, color: HAVEN_COLORS.success}}>
                  Optional
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showSocial ? 'rotate-180' : ''}`}
                           style={{color: HAVEN_COLORS.success}} />
            </CardTitle>
          </CardHeader>
          <CardContent className={`${showSocial ? 'space-y-3' : 'hidden'} transition-all p-4 pt-0`}>
            <div>
              <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                <Globe className="inline h-4 w-4 mr-1" />
                Website
              </label>
              <input type="url" name="website" value={formData.website} onChange={handleInputChange} placeholder="https://yourrobot.com"
                     className={`w-full px-3 py-2 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                     style={{
                       boxShadow: `0 0 10px ${HAVEN_COLORS.success}15`,
                       borderColor: HAVEN_COLORS.success + '40'
                     }} />
            </div>
            <div>
              <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                <Twitter className="inline h-4 w-4 mr-1" />
                Twitter
              </label>
              <input type="url" name="twitter" value={formData.twitter} onChange={handleInputChange} placeholder="https://twitter.com/yourrobot"
                     className={`w-full px-3 py-2 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                     style={{
                       boxShadow: `0 0 10px ${HAVEN_COLORS.success}15`,
                       borderColor: HAVEN_COLORS.success + '40'
                     }} />
            </div>
            <div>
              <label className={`block text-sm font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                <MessageCircle className="inline h-4 w-4 mr-1" />
                Telegram
              </label>
              <input type="url" name="telegram" value={formData.telegram} onChange={handleInputChange} placeholder="https://t.me/yourrobot"
                     className={`w-full px-3 py-2 border rounded-xl text-sm transition-all duration-300 focus:outline-none focus:scale-[1.02] ${isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                     style={{
                       boxShadow: `0 0 10px ${HAVEN_COLORS.success}15`,
                       borderColor: HAVEN_COLORS.success + '40'
                     }} />
            </div>
          </CardContent>
        </Card>

        {/* Connection Type (collapsible) - shown on desktop in right column - Compact & Collapsed */}
        <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01] hidden lg:block`}
              style={{boxShadow: showConnection ? `0 0 25px ${HAVEN_COLORS.primary}20` : `0 0 15px ${HAVEN_COLORS.primary}10`}}>
          <CardHeader className="cursor-pointer hover:bg-white/5 transition-all duration-300 p-4" onClick={() => setShowConnection(v => !v)}>
            <CardTitle className={`flex items-center justify-between text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              <span className="flex items-center gap-2">
                <Usb className="h-5 w-5" style={{color: HAVEN_COLORS.primary}} />
                Connection Type
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showConnection ? 'rotate-180' : ''}`}
                           style={{color: HAVEN_COLORS.primary}} />
            </CardTitle>
          </CardHeader>
          <CardContent className={`${showConnection ? 'space-y-3' : 'hidden'} transition-all p-4 pt-0`}>
            {/* Simulation Option - Compact */}
            <div
              className={`p-3 border-2 rounded-xl cursor-pointer transition-all duration-300 hover:scale-[1.02]`}
              style={{
                borderColor: formData.connection_type === 'simulation' ? HAVEN_COLORS.primary : HAVEN_COLORS.primary + '40',
                backgroundColor: formData.connection_type === 'simulation' ? `${HAVEN_COLORS.primary}15` : `${HAVEN_COLORS.primary}05`,
                boxShadow: formData.connection_type === 'simulation' ? `0 0 15px ${HAVEN_COLORS.primary}30` : 'none'
              }}
              onClick={() => setFormData(prev => ({ ...prev, connection_type: 'simulation' }))}
            >
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2`}
                     style={{
                       borderColor: formData.connection_type === 'simulation' ? HAVEN_COLORS.primary : HAVEN_COLORS.primary + '60',
                       backgroundColor: formData.connection_type === 'simulation' ? HAVEN_COLORS.primary : 'transparent'
                     }}>
                  {formData.connection_type === 'simulation' && (
                    <div className="w-full h-full rounded-full bg-white scale-50"></div>
                  )}
                </div>
                <div>
                  <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} font-bold text-sm`}>
                    {activeTab === 'agent' ? 'Language Learning Model' : 'Digital Twin Simulation'}
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                    {activeTab === 'agent' ? 'Terminal simulation' : 'Virtual robot simulation'}
                  </p>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

          {/* Pair Selection Toggle */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300`}
                style={{boxShadow: `0 0 20px ${HAVEN_COLORS.primary}15`}}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Trading Pair
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPair('haven')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${
                    selectedPair === 'haven'
                      ? 'scale-105 shadow-lg'
                      : 'opacity-60 hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: selectedPair === 'haven' ? `${HAVEN_COLORS.primary}20` : isDark ? '#1e293b' : '#f1f5f9',
                    border: `2px solid ${selectedPair === 'haven' ? HAVEN_COLORS.primary : isDark ? '#334155' : '#cbd5e1'}`,
                    color: selectedPair === 'haven' ? HAVEN_COLORS.primary : isDark ? '#94a3b8' : '#64748b'
                  }}
                >
                  <img
                    src="/assets/Haven-icon-Vibrantblue-black-Background.png"
                    alt="Haven"
                    className="w-6 h-6 rounded-full"
                  />
                  <span>HAVEN</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPair('bnb')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${
                    selectedPair === 'bnb'
                      ? 'scale-105 shadow-lg'
                      : 'opacity-60 hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: selectedPair === 'bnb' ? '#f3ba2f20' : isDark ? '#1e293b' : '#f1f5f9',
                    border: `2px solid ${selectedPair === 'bnb' ? '#f3ba2f' : isDark ? '#334155' : '#cbd5e1'}`,
                    color: selectedPair === 'bnb' ? '#f3ba2f' : isDark ? '#94a3b8' : '#64748b'
                  }}
                >
                  <img
                    src="/assets/bnb-bnb-logo.png"
                    alt="BNB"
                    className="w-6 h-6 rounded-full"
                  />
                  <span>BNB</span>
                </button>
              </div>
              <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                {selectedPair === 'haven' ? 'Trade with HAVEN tokens' : 'Trade with BNB/WBNB'}
              </p>
            </CardContent>
          </Card>

          {/* Preview Card */}
          <Card className={`${isDark ? 'bg-slate-900/70 border-slate-700/60 backdrop-blur-sm' : 'bg-white border-gray-200'} rounded-2xl transition-all duration-300 hover:scale-[1.01]`}
                style={{boxShadow: `0 0 20px ${HAVEN_COLORS.primary}15`}}>
            <CardHeader className="p-4">
              <CardTitle className={`flex items-center gap-2 text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                <Sparkles className="h-5 w-5 animate-pulse" style={{color: HAVEN_COLORS.warning}} />
                <span>Preview</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              {/* Mock robot card preview - Cute & Compact */}
              <div className={`${isDark ? 'bg-slate-800/70 border-slate-700/60' : 'bg-gray-50 border-gray-200'} border-2 rounded-2xl p-3 transition-all duration-300 hover:scale-105`}
                   style={{
                     borderColor: HAVEN_COLORS.primary + '40',
                     boxShadow: `0 0 15px ${HAVEN_COLORS.primary}20`
                   }}>
                <div className="space-y-2">
                  {/* Image preview - Compact */}
                  <div className={`w-full h-24 rounded-xl flex items-center justify-center overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`}
                       style={{
                         border: `2px solid ${HAVEN_COLORS.primary}`,
                         boxShadow: `0 0 15px ${HAVEN_COLORS.primary}30`
                       }}>
                    {imagePreview ? (
                      <img src={imagePreview} alt={activeTab === 'agent' ? 'Agent preview' : 'Robot preview'} className="w-full h-full object-cover" />
                    ) : (
                      <Bot className={`h-6 w-6 animate-pulse`} style={{color: HAVEN_COLORS.primary}} />
                    )}
                  </div>

                  {/* Info preview - Compact */}
                  <div>
                    <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} font-bold text-sm truncate`}>
                      {formData.name || (activeTab === 'agent' ? 'Agent Name' : 'Robot Name')}
                    </h3>
                    <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse"
                           style={{backgroundColor: HAVEN_COLORS.success}}></div>
                      <span>Idle</span>
                    </div>
                  </div>

                  <div className="text-xs">
                    <div className="flex justify-between items-center">
                      <span className={`${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Ticker:</span>
                      <span className="font-black text-sm px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${HAVEN_COLORS.primary}20`,
                              color: HAVEN_COLORS.primary
                            }}>
                        ${formData.ticker || 'TICKER'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button - Sticky in right column */}
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || isUploadingImage || formData.connection_type === 'usb'}
                className={`w-full rounded-xl text-white shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 h-11 text-base font-black disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSubmitting || isUploadingImage ? 'animate-pulse' : ''
                }`}
                style={{
                  background: `linear-gradient(135deg, ${HAVEN_COLORS.primary}, ${HAVEN_COLORS.success})`,
                  boxShadow: `0 8px 25px ${HAVEN_COLORS.primary}40`
                }}
              >
                <Bot className="mr-2 h-5 w-5" />
                {isUploadingImage
                  ? 'Uploading Image...'
                  : isSubmitting
                  ? (activeTab === 'agent' ? 'Creating AI Agent...' : 'Creating Robot...')
                  : formData.connection_type === 'usb'
                    ? 'USB Coming Soon'
                    : (activeTab === 'agent' ? 'Create AI Agent & Deploy Token' : 'Create Robot & Deploy Token')
                }
              </Button>
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
          setFormData(prev => ({ ...prev, sim_type: simTypeId || prev.sim_type, gamerules: gameSimId || prev.gamerules }))
          // Refresh list after editing
          try { await loadMyCustomEnvs() } catch {}
          setShowMyEnvs(true)
        }}
      />
    </div>
    </>
  )
}
