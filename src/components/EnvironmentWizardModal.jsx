import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { X, Plus, Minus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'

export default function EnvironmentWizardModal({ open, onClose, address, isDark, onCreated, fetchOptions, singleStep = false, editTarget = null, presetSimTypeId = '', presetGameSimId = '', prefillSimConfig = null, prefillGameConfig = null }) {
  const [step, setStep] = useState(1) // 1 = sim type, 2 = game sim
  const [loading, setLoading] = useState(false)
  const [sessionOk, setSessionOk] = useState(false)

  // Sim Type form state
  const [simTypeId, setSimTypeId] = useState('')
  const [commands, setCommands] = useState([''])
  const [abilitiesList, setAbilitiesList] = useState([''])
  const [sensorsList, setSensorsList] = useState([''])
  const [customSections, setCustomSections] = useState([]) // [{ name: string, items: string[] }]

  // Game Rules form state
  const [gameSimId, setGameSimId] = useState('')
  const [xMax, setXMax] = useState(40)
  const [yMax, setYMax] = useState(40)
  const [robotXSize, setRobotXSize] = useState(2)
  const [robotYSize, setRobotYSize] = useState(1)
  const [objects, setObjects] = useState([{ x_pos: 0, y_pos: 0, x_size: 1, y_size: 1, pickable: false }])

  const labelClass = `block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-gray-700'}`
  const smallLabelClass = `block text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`
  const inputBaseClass = 'w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5854f4] focus:border-[#5854f4]'
  const inputThemeClass = isDark ? 'bg-transparent border-slate-600 text-white placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
  const readOnlyInputClass = `${inputBaseClass} ${isDark ? 'bg-slate-900/50 border-slate-700/60 text-slate-300' : 'bg-white/70 border-gray-200 text-gray-700'} cursor-not-allowed`
  const textInputClass = `${inputBaseClass} ${inputThemeClass}`
  const numberInputClass = `${inputBaseClass} appearance-none [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${inputThemeClass}`
  const outlineButtonClass = `${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-900/40' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`

  const ROBOT_API_BASE = '/api'
  const apiFetch = (path, init) => fetch(`${ROBOT_API_BASE}${path}`, init)

  const resetWizardState = () => {
    // If editing game rules in single-step mode, open directly on step 2
    setStep(singleStep && editTarget === 'game' ? 2 : 1)
    setSessionOk(false)
    setLoading(false)
    setSimTypeId('')
    setCommands([''])
    setAbilitiesList([''])
    setSensorsList([''])
    setCustomSections([])
    setGameSimId('')
    setXMax(40)
    setYMax(40)
    setRobotXSize(2)
    setRobotYSize(1)
    setObjects([{ x_pos: 0, y_pos: 0, x_size: 1, y_size: 1, pickable: false }])
  }

  useEffect(() => {
    if (!open) return
    resetWizardState()
    let cancelled = false
    const start = async () => {
      setLoading(true)
      try {
        // If single-step edit, prefill and skip creation
        if (singleStep && editTarget === 'sim') {
          if (presetSimTypeId) setSimTypeId(presetSimTypeId)
          const cfg = prefillSimConfig || {}
          
          // Commands
          const cmds = Array.isArray(cfg.command_list) ? cfg.command_list : []
          setCommands(cmds.length > 0 ? cmds : [''])
          
          // Abilities
          const abilitiesStr = cfg?.status?.abilities || ''
          if (abilitiesStr) {
            setAbilitiesList(String(abilitiesStr).split(',').map(s => s.trim()).filter(Boolean))
          } else {
            setAbilitiesList([''])
          }
          
          // Sensors
          const sensorsObj = cfg?.status?.sensors || {}
          const sKeys = Object.keys(sensorsObj)
          setSensorsList(sKeys.length > 0 ? sKeys : [''])
          
          // Custom sections (any keys not in status.abilities, status.sensors, command_list, status.size)
          const knownKeys = new Set(['command_list', 'status'])
          const customSects = []
          Object.keys(cfg).forEach(key => {
            if (knownKeys.has(key)) return
            const value = cfg[key]
            if (Array.isArray(value)) {
              customSects.push({ name: key, items: value.length > 0 ? value : [''] })
            }
          })
          if (customSects.length > 0) setCustomSections(customSects)
          
          setSessionOk(true)
          return
        }
        if (singleStep && editTarget === 'game') {
          if (presetGameSimId) setGameSimId(presetGameSimId)
          const cfg = prefillGameConfig || {}
          
          // Grid dimensions (try both lowercase and uppercase)
          const xMaxVal = cfg.x_max ?? cfg.X_MAX
          const yMaxVal = cfg.y_max ?? cfg.Y_MAX
          const robotXVal = cfg.robot_x_size ?? cfg.ROBOT_X_SIZE
          const robotYVal = cfg.robot_y_size ?? cfg.ROBOT_Y_SIZE
          
          if (typeof xMaxVal === 'number') setXMax(xMaxVal)
          if (typeof yMaxVal === 'number') setYMax(yMaxVal)
          if (typeof robotXVal === 'number') setRobotXSize(robotXVal)
          if (typeof robotYVal === 'number') setRobotYSize(robotYVal)
          
          // Objects
          if (Array.isArray(cfg.objects) && cfg.objects.length > 0) {
            setObjects(cfg.objects)
          } else {
            setObjects([{ x_pos: 0, y_pos: 0, x_size: 1, y_size: 1, pickable: false }])
          }
          
          setSessionOk(true)
          return
        }
        const createRes = await apiFetch(`/robot/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creator_wallet: address || '' })
        })
        let created = null
        if (createRes.ok) created = await createRes.json().catch(() => null)
        const simId = created?.sim_type || created?.new_sim_type || created?.simType || created?.sim_type_id || ''
        const gameId = created?.gamerules || created?.game_sim_id || created?.new_game_sim_id || created?.gameSimId || ''
        if (!cancelled && simId) setSimTypeId(simId)
        if (!cancelled && gameId) setGameSimId(gameId)
        if (!cancelled) setSessionOk(createRes.ok)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    start()
    return () => { cancelled = true }
  }, [open, address, singleStep, editTarget, presetSimTypeId, presetGameSimId, prefillSimConfig, prefillGameConfig])

  const addCommand = () => setCommands(prev => [...prev, ''])
  const removeCommand = (idx) => setCommands(prev => prev.filter((_, i) => i !== idx))

  const addAbility = () => setAbilitiesList(prev => [...prev, ''])
  const removeAbility = (idx) => setAbilitiesList(prev => prev.filter((_, i) => i !== idx))

  const addSensor = () => setSensorsList(prev => [...prev, ''])
  const removeSensor = (idx) => setSensorsList(prev => prev.filter((_, i) => i !== idx))

  // Custom sections helpers
  const addSection = () => setCustomSections(prev => [...prev, { name: '', items: [''] }])
  const removeSection = (sectionIdx) => setCustomSections(prev => prev.filter((_, i) => i !== sectionIdx))
  const setSectionName = (sectionIdx, name) => setCustomSections(prev => prev.map((s, i) => (i === sectionIdx ? { ...s, name } : s)))
  const addSectionItem = (sectionIdx) => setCustomSections(prev => prev.map((s, i) => (i === sectionIdx ? { ...s, items: [...s.items, ''] } : s)))
  const setSectionItem = (sectionIdx, itemIdx, value) => setCustomSections(prev => prev.map((s, i) => (i === sectionIdx ? { ...s, items: s.items.map((it, j) => (j === itemIdx ? value : it)) } : s)))
  const removeSectionItem = (sectionIdx, itemIdx) => setCustomSections(prev => prev.map((s, i) => (i === sectionIdx ? { ...s, items: s.items.filter((_, j) => j !== itemIdx) } : s)))

  const addObject = () => setObjects(prev => [...prev, { x_pos: 0, y_pos: 0, x_size: 1, y_size: 1, pickable: false }])
  const removeObject = (idx) => setObjects(prev => prev.filter((_, i) => i !== idx))

  const submitSimType = async () => {
    // Sends: command_list, abilities, sensors to the given simTypeId
    setLoading(true)
    try {
      const isEditingSim = singleStep && editTarget === 'sim'
      // Prefer existing/preset ID when editing; do NOT create a new one
      let targetId = simTypeId || (isEditingSim ? presetSimTypeId : '')
      if (!targetId && !isEditingSim) {
        try {
          const createRes = await apiFetch(`/robot/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creator_wallet: address || '' })
          })
          const created = await createRes.json().catch(() => null)
          const stId = created?.sim_type || created?.new_sim_type || created?.simType || created?.sim_type_id || ''
          if (stId) {
            setSimTypeId(stId)
            targetId = stId
          }
        } catch {}
      }
      if (!targetId) return
      const normalizedCommands = (Array.isArray(commands) ? commands : [])
        .map(cmd => (typeof cmd === 'string' ? cmd.trim() : ''))
        .filter(Boolean)
      if (normalizedCommands.length > 0) {
        await apiFetch(`/robot/robots/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sim_type: targetId, key: 'command_list', value: normalizedCommands })
        })
      }
      const normalizedAbilities = (Array.isArray(abilitiesList) ? abilitiesList : [])
        .map(ab => (typeof ab === 'string' ? ab.trim() : ''))
        .filter(Boolean)
      if (normalizedAbilities.length > 0) {
        await apiFetch(`/robot/robots/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sim_type: targetId, key: 'status.abilities', value: normalizedAbilities.join(', ') })
        })
      }
      const sensorsPayload = (Array.isArray(sensorsList) ? sensorsList : []).reduce((acc, key) => {
        const trimmed = typeof key === 'string' ? key.trim() : ''
        if (trimmed) acc[trimmed] = true
        return acc
      }, {})
      if (Object.keys(sensorsPayload).length > 0) {
        await apiFetch(`/robot/robots/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sim_type: targetId, key: 'status.sensors', value: sensorsPayload })
        })
      }

      if (Array.isArray(customSections) && customSections.length > 0) {
        for (const section of customSections) {
          const key = (section?.name || '').trim()
          const value = (Array.isArray(section?.items) ? section.items : [])
            .map(v => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean)
          if (!key || value.length === 0) continue
          await apiFetch(`/robot/robots/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sim_type: targetId, key, value })
          })
        }
      }
      if (isEditingSim) {
        if (typeof fetchOptions === 'function') await fetchOptions()
        if (typeof onCreated === 'function') onCreated({ simTypeId: targetId, gameSimId })
        if (typeof onClose === 'function') onClose()
      } else {
        setStep(2)
      }
    } finally {
      setLoading(false)
    }
  }

  const submitGameRules = async () => {
    setLoading(true)
    try {
      const isEditingGame = singleStep && editTarget === 'game'
      let targetId = gameSimId || (isEditingGame ? presetGameSimId : '')
      let resolvedSimId = simTypeId || (isEditingGame ? presetSimTypeId : '')
      if (!targetId && !isEditingGame) {
        try {
          const createRes = await apiFetch(`/robot/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creator_wallet: address || '' })
          })
          const created = await createRes.json().catch(() => null)
          const gmId = created?.gamerules || created?.game_sim_id || created?.new_game_sim_id || created?.gameSimId || ''
          if (gmId) {
            setGameSimId(gmId)
            targetId = gmId
          }
          const stId = created?.sim_type || created?.new_sim_type || created?.simType || created?.sim_type_id || ''
          if (stId) {
            setSimTypeId(stId)
            resolvedSimId = stId
          }
        } catch {}
      }
      if (!targetId) return
      const kvs = [
        { key: 'X_MAX', value: Number(xMax) },
        { key: 'Y_MAX', value: Number(yMax) },
        { key: 'ROBOT_X_SIZE', value: Number(robotXSize) },
        { key: 'ROBOT_Y_SIZE', value: Number(robotYSize) },
      ]
      for (const { key, value } of kvs) {
        if (!Number.isFinite(value)) continue
        await apiFetch(`/robot/robots/rules`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ robot_id: targetId, key, value })
        })
      }
      // Send objects one by one as per provided example
      for (const obj of objects) {
        const payload = {
          x_pos: Number(obj?.x_pos),
          y_pos: Number(obj?.y_pos),
          x_size: Number(obj?.x_size),
          y_size: Number(obj?.y_size),
          pickable: !!obj?.pickable
        }
        const numericKeys = ['x_pos', 'y_pos', 'x_size', 'y_size']
        if (!numericKeys.every(k => Number.isFinite(payload[k]))) continue
        await apiFetch(`/robot/robots/rules`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ robot_id: targetId, obj: payload })
        })
      }
      // Refresh dropdown options and preselect newly created ids
      if (typeof fetchOptions === 'function') await fetchOptions()
      if (typeof onCreated === 'function') onCreated({ simTypeId: resolvedSimId || simTypeId || '', gameSimId: targetId })
      if (typeof onClose === 'function') onClose()
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`absolute left-1/2 top-1/2 w-[95vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border shadow-2xl ${
          isDark ? 'bg-slate-900/70 border-slate-700/60 text-white' : 'bg-white/80 border-gray-200 backdrop-blur-md text-gray-900'
        }`}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-slate-700/60' : 'border-gray-200/70'}`}>
          <div className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Step {step} of 2</div>
          <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800/60 text-slate-300' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-auto">
          {step === 1 && (
            <div className="space-y-6">
              <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Create Sim Type</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className={labelClass}>Sim Type ID</label>
                  <input value={simTypeId} readOnly className={readOnlyInputClass} />
                </div>

                <div className="space-y-3">
                  <label className={labelClass}>Abilities</label>
                  <div className="space-y-2">
                    {abilitiesList.map((ab, idx) => (
                      <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <input
                          value={ab}
                          onChange={e => setAbilitiesList(prev => prev.map((a, i) => (i === idx ? e.target.value : a)))}
                          placeholder="Ability"
                          className={textInputClass}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeAbility(idx)}
                          className={`border ${outlineButtonClass} h-9 rounded-lg px-3 sm:w-11 sm:px-0`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addAbility}
                      className={`border ${outlineButtonClass} h-9 rounded-lg px-4 text-sm font-medium`}
                    >
                      <Plus className="h-4 w-4 mr-2" />Add Ability
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className={labelClass}>Commands</label>
                  <div className="space-y-2">
                    {commands.map((cmd, idx) => (
                      <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <input
                          value={cmd}
                          onChange={e => setCommands(prev => prev.map((c, i) => (i === idx ? e.target.value : c)))}
                          placeholder="Command name"
                          className={textInputClass}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeCommand(idx)}
                          className={`border ${outlineButtonClass} h-9 rounded-lg px-3 sm:w-11 sm:px-0`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addCommand}
                      className={`border ${outlineButtonClass} h-9 rounded-lg px-4 text-sm font-medium`}
                    >
                      <Plus className="h-4 w-4 mr-2" />Add Command
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className={labelClass}>Sensors</label>
                  <div className="space-y-2">
                    {sensorsList.map((s, idx) => (
                      <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <input
                          value={s}
                          onChange={e => setSensorsList(prev => prev.map((si, i) => (i === idx ? e.target.value : si)))}
                          placeholder="Sensor key (e.g., lidar)"
                          className={textInputClass}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeSensor(idx)}
                          className={`border ${outlineButtonClass} h-9 rounded-lg px-3 sm:w-11 sm:px-0`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addSensor}
                      className={`border ${outlineButtonClass} h-9 rounded-lg px-4 text-sm font-medium`}
                    >
                      <Plus className="h-4 w-4 mr-2" />Add Sensor
                    </Button>
                  </div>
                </div>

                {/* Custom Sections */}
                <div className="space-y-3">
                  <label className={labelClass}>Custom sections</label>
                  <div className="space-y-3">
                    {customSections.map((section, sIdx) => (
                      <div key={sIdx} className={`rounded-2xl border p-4 shadow-sm ${isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-gray-200 bg-white/80 backdrop-blur-md'} space-y-3`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <input
                            value={section.name}
                            onChange={e => setSectionName(sIdx, e.target.value)}
                            placeholder="Section name (e.g., extras)"
                            className={textInputClass}
                          />
                          <Button type="button" variant="outline" onClick={() => removeSection(sIdx)} className={`border ${outlineButtonClass} h-9 rounded-lg px-3 sm:w-11 sm:px-0`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {section.items.map((it, iIdx) => (
                            <div key={iIdx} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                              <input value={it} onChange={e => setSectionItem(sIdx, iIdx, e.target.value)} placeholder="Item" className={textInputClass} />
                              <Button type="button" variant="outline" onClick={() => removeSectionItem(sIdx, iIdx)} className={`border ${outlineButtonClass} h-9 rounded-lg px-3 sm:w-11 sm:px-0`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" variant="outline" onClick={() => addSectionItem(sIdx)} className={`border ${outlineButtonClass} h-9 rounded-lg px-4 text-sm font-medium`}>
                            <Plus className="h-4 w-4 mr-2" />Add Item
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addSection} className={`border ${outlineButtonClass} h-9 rounded-lg px-4 text-sm font-medium`}>
                      <Plus className="h-4 w-4 mr-2" />Add Section
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <div className={`text-xs font-medium ${sessionOk ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                  {sessionOk ? 'Session ready' : 'Starting session...'}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className={`border ${outlineButtonClass} h-11 rounded-lg px-5 text-sm font-medium`}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={submitSimType}
                    disabled={loading}
                    className="h-11 rounded-lg bg-gradient-to-r from-[#5854f4] to-[#7c3aed] px-5 text-sm font-semibold text-white shadow-lg transition-all hover:from-[#4c46e8] hover:to-[#6d28d9] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4 mr-2" />Next
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Create Game Rules</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className={labelClass}>Game Sim ID</label>
                  <input value={gameSimId} readOnly className={readOnlyInputClass} />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className={smallLabelClass}>X_MAX</label>
                    <input type="number" value={xMax} onChange={e => setXMax(e.target.value)} className={numberInputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className={smallLabelClass}>Y_MAX</label>
                    <input type="number" value={yMax} onChange={e => setYMax(e.target.value)} className={numberInputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className={smallLabelClass}>ROBOT X size</label>
                    <input type="number" value={robotXSize} onChange={e => setRobotXSize(e.target.value)} className={numberInputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className={smallLabelClass}>ROBOT Y size</label>
                    <input type="number" value={robotYSize} onChange={e => setRobotYSize(e.target.value)} className={numberInputClass} />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className={labelClass}>Objects</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addObject}
                    className={`border ${outlineButtonClass} h-9 rounded-lg px-4 text-sm font-medium`}
                  >
                    <Plus className="h-4 w-4 mr-2" />Add Object
                  </Button>
                </div>
                <div className="space-y-4">
                  {objects.map((obj, idx) => (
                    <div
                      key={idx}
                      className={`rounded-2xl border p-4 shadow-sm ${isDark ? 'border-slate-700/60 bg-slate-900/50' : 'border-gray-200 bg-white/80 backdrop-blur-md'} space-y-4`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Object {idx + 1}</div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeObject(idx)}
                          className={`border ${outlineButtonClass} h-9 w-9 rounded-lg`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                        <div className="space-y-2">
                          <label className={smallLabelClass}>x_pos</label>
                          <input
                            type="number"
                            value={obj.x_pos}
                            onChange={e => setObjects(prev => prev.map((o, i) => (i === idx ? { ...o, x_pos: Number(e.target.value) } : o)))}
                            className={numberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className={smallLabelClass}>y_pos</label>
                          <input
                            type="number"
                            value={obj.y_pos}
                            onChange={e => setObjects(prev => prev.map((o, i) => (i === idx ? { ...o, y_pos: Number(e.target.value) } : o)))}
                            className={numberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className={smallLabelClass}>x_size</label>
                          <input
                            type="number"
                            value={obj.x_size}
                            onChange={e => setObjects(prev => prev.map((o, i) => (i === idx ? { ...o, x_size: Number(e.target.value) } : o)))}
                            className={numberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className={smallLabelClass}>y_size</label>
                          <input
                            type="number"
                            value={obj.y_size}
                            onChange={e => setObjects(prev => prev.map((o, i) => (i === idx ? { ...o, y_size: Number(e.target.value) } : o)))}
                            className={numberInputClass}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className={smallLabelClass}>Pickable</label>
                          <label
                            className={`flex h-11 items-center justify-between rounded-lg border px-3 ${isDark ? 'border-slate-700/60 bg-slate-900/40 text-slate-200' : 'border-gray-200 bg-white/80 text-gray-700 backdrop-blur-md'}`}
                          >
                            <span className="text-sm font-medium">Enabled</span>
                            <input
                              type="checkbox"
                              checked={!!obj.pickable}
                              onChange={e => setObjects(prev => prev.map((o, i) => (i === idx ? { ...o, pickable: e.target.checked } : o)))}
                              className="h-4 w-4 accent-[#5854f4]"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className={`border ${outlineButtonClass} h-11 rounded-lg px-5 text-sm font-medium`}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />Back
                </Button>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className={`border ${outlineButtonClass} h-11 rounded-lg px-5 text-sm font-medium`}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={submitGameRules}
                    disabled={loading}
                    className="h-11 rounded-lg bg-gradient-to-r from-[#5854f4] to-[#7c3aed] px-5 text-sm font-semibold text-white shadow-lg transition-all hover:from-[#4c46e8] hover:to-[#6d28d9] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Finish
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

