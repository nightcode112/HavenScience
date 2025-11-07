import React from 'react'
import { Zap, Send, Plus, Loader2, MinusIcon, PlusIcon, Crosshair } from 'lucide-react'

const HAVEN_COLORS = {
  background: '#0a0e27',
  surface: '#141b3a',
  elevated: '#1a2347',
  border: '#2d3a5f',
  text: '#e2e8f0',
  textSecondary: '#94a3b8',
  primary: '#3b82f6'
}

const CompactControlPanel = ({
  // Status props
  tokenData,
  simulationIdentifier,
  batteryLevel,
  batteryColor,
  speedVal,
  sizeLabel,
  collisionLabel,
  abilitiesVal,
  sensorsLabel,
  statusLabel,
  normalizedState,

  // Commands props
  walletAddress,
  isStartingSimulation,
  handleStartSimulation,
  DEFAULT_COMMANDS,
  COMMAND_ICONS,
  selectedCommand,
  handleCommandSelect,
  customCommand,
  setCustomCommand,
  setSelectedCommand,
  isAddingCommand,
  handleAddCustomCommand,
  isSendingCommand,
  handleSendCommand,

  // Terminal props
  terminalRef,
  terminalDisplay,
  isTyping,
  setTerminalOutput,
  setTerminalDisplay,
  setIsTyping,

  // Map props
  posLabelX,
  posLabelY,
  zoomOut,
  zoomIn,
  centerOnRobot,
  mapOuterRef,
  mapInnerRef,
  zoom,
  statusInfo,
  robot,
  objectList,
  robotSizeX,
  robotSizeY,
  collision,
  safeImageUrl
}) => {
  return (
    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-2 p-2" style={{backgroundColor: HAVEN_COLORS.background}}>
      {/* Left Column - Status, Commands, Terminal */}
      <div className="flex-1 flex flex-col gap-2 overflow-hidden">
        {/* Robot Status - Compact */}
        <div className="rounded p-2" style={{backgroundColor: HAVEN_COLORS.surface, border: `1px solid ${HAVEN_COLORS.border}`}}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold" style={{color: HAVEN_COLORS.text}}>Status</h3>
            <span className="text-[10px] px-2 py-0.5 rounded" style={{
              backgroundColor: normalizedState === 'idle' ? 'rgba(134, 239, 172, 0.1)' : 'rgba(103, 232, 249, 0.1)',
              color: normalizedState === 'idle' ? '#86efac' : '#67e8f9'
            }}>{statusLabel}</span>
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[10px]">
            <div><span style={{color: HAVEN_COLORS.textSecondary}}>Token:</span> <span style={{color: HAVEN_COLORS.primary}} className="font-bold">{tokenData.symbol || 'TKN'}</span></div>
            <div><span style={{color: HAVEN_COLORS.textSecondary}}>Sim:</span> <span style={{color: HAVEN_COLORS.text}}>{simulationIdentifier || 'X'}</span></div>
            <div className="flex items-center gap-1"><Zap className={`h-3 w-3 ${batteryColor}`} /><span className={batteryColor}>{batteryLevel}%</span></div>
            <div><span style={{color: HAVEN_COLORS.textSecondary}}>Speed:</span> <span style={{color: HAVEN_COLORS.text}}>{Number(speedVal) || 0}</span></div>
            <div><span style={{color: HAVEN_COLORS.textSecondary}}>Size:</span> <span style={{color: HAVEN_COLORS.text}}>{sizeLabel}</span></div>
            <div><span style={{color: HAVEN_COLORS.textSecondary}}>Collision:</span> <span style={{color: HAVEN_COLORS.text}}>{collisionLabel}</span></div>
            <div><span style={{color: HAVEN_COLORS.textSecondary}}>Abilities:</span> <span style={{color: HAVEN_COLORS.text}}>{String(abilitiesVal)}</span></div>
            <div><span style={{color: HAVEN_COLORS.textSecondary}}>Sensors:</span> <span style={{color: HAVEN_COLORS.text}}>{sensorsLabel}</span></div>
          </div>
        </div>

        {/* Commands */}
        <div className="rounded p-2 flex-shrink-0" style={{backgroundColor: HAVEN_COLORS.surface, border: `1px solid ${HAVEN_COLORS.border}`}}>
          <h3 className="text-xs font-bold mb-1" style={{color: HAVEN_COLORS.text}}>Commands</h3>
          {(!simulationIdentifier || simulationIdentifier === 'X') ? (
            <div className="text-center py-2">
              <p className="text-[10px] mb-2" style={{color: HAVEN_COLORS.textSecondary}}>Start simulation to enable</p>
              <button
                disabled={!walletAddress || isStartingSimulation}
                onClick={handleStartSimulation}
                className="px-3 py-1 rounded text-xs font-medium transition-all"
                style={{
                  backgroundColor: (!walletAddress || isStartingSimulation) ? HAVEN_COLORS.elevated : HAVEN_COLORS.primary,
                  color: 'white',
                  opacity: (!walletAddress || isStartingSimulation) ? 0.6 : 1
                }}
              >
                {isStartingSimulation ? 'Starting...' : 'Start Simulation'}
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-2 gap-1">
                {DEFAULT_COMMANDS.map((command) => {
                  const Icon = COMMAND_ICONS[command] || Send
                  const isSelected = selectedCommand === command
                  return (
                    <button
                      key={command}
                      onClick={() => handleCommandSelect(command)}
                      className="flex items-center px-2 py-1 rounded text-[10px] transition-all"
                      style={{
                        backgroundColor: isSelected ? HAVEN_COLORS.primary : HAVEN_COLORS.elevated,
                        color: isSelected ? 'white' : HAVEN_COLORS.text,
                        border: `1px solid ${isSelected ? HAVEN_COLORS.primary : HAVEN_COLORS.border}`
                      }}
                    >
                      <Icon className="h-3 w-3 mr-1" />
                      <span className="truncate">{command.replace(' One Step', '')}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="Custom command..."
                  value={customCommand}
                  onChange={(e) => {
                    setCustomCommand(e.target.value)
                    setSelectedCommand('')
                  }}
                  className="flex-1 px-2 py-1 border rounded text-[10px]"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: HAVEN_COLORS.border,
                    color: HAVEN_COLORS.text
                  }}
                  disabled={!simulationIdentifier || simulationIdentifier === 'X'}
                />
                <button
                  onClick={handleAddCustomCommand}
                  disabled={isAddingCommand || !walletAddress || (!simulationIdentifier || simulationIdentifier === 'X')}
                  className="px-2 py-1 rounded transition-all"
                  style={{
                    backgroundColor: (isAddingCommand || !walletAddress || !simulationIdentifier || simulationIdentifier === 'X') ? HAVEN_COLORS.elevated : HAVEN_COLORS.primary,
                    color: 'white',
                    opacity: (isAddingCommand || !walletAddress || !simulationIdentifier || simulationIdentifier === 'X') ? 0.6 : 1
                  }}
                >
                  {isAddingCommand ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </button>
              </div>
              <button
                onClick={handleSendCommand}
                disabled={isSendingCommand || !walletAddress || (!simulationIdentifier || simulationIdentifier === 'X')}
                className="w-full py-1 rounded text-xs font-medium transition-all flex items-center justify-center"
                style={{
                  backgroundColor: (isSendingCommand || !walletAddress || !simulationIdentifier || simulationIdentifier === 'X') ? HAVEN_COLORS.elevated : HAVEN_COLORS.primary,
                  color: 'white',
                  opacity: (isSendingCommand || !walletAddress || !simulationIdentifier || simulationIdentifier === 'X') ? 0.6 : 1
                }}
              >
                {isSendingCommand ? (
                  <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Sending...</>
                ) : (
                  <><Send className="mr-1 h-3 w-3" />Send Command</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Terminal - Flexible */}
        <div className="rounded p-2 flex-1 flex flex-col overflow-hidden" style={{backgroundColor: HAVEN_COLORS.surface, border: `1px solid ${HAVEN_COLORS.border}`}}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold" style={{color: HAVEN_COLORS.text}}>Terminal</h3>
            <button
              onClick={() => { setTerminalOutput(''); setTerminalDisplay(''); setIsTyping(false) }}
              className="px-2 py-0.5 rounded border text-[10px] transition-colors"
              style={{
                borderColor: HAVEN_COLORS.border,
                color: HAVEN_COLORS.text,
                backgroundColor: 'transparent'
              }}
            >
              Clear
            </button>
          </div>
          <div
            className="rounded border overflow-hidden flex-1"
            style={{
              borderColor: HAVEN_COLORS.border,
              backgroundColor: '#00000099'
            }}
          >
            <pre
              ref={terminalRef}
              className="text-green-300 text-[11px] font-mono leading-relaxed whitespace-pre-wrap p-2 overflow-auto h-full"
            >
              {terminalDisplay || (isTyping ? '' : 'Waiting for output…')}{isTyping ? '\u2589' : ''}
            </pre>
          </div>
        </div>
      </div>

      {/* Right Column - Map */}
      <div className="lg:w-96 flex flex-col gap-2">
        {/* Map */}
        <div className="rounded p-2 flex-1 flex flex-col" style={{backgroundColor: HAVEN_COLORS.surface, border: `1px solid ${HAVEN_COLORS.border}`}}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold" style={{color: HAVEN_COLORS.text}}>
              Map <span style={{color: HAVEN_COLORS.textSecondary}} className="text-[10px]">({`X: ${posLabelX}, Y: ${posLabelY}`})</span>
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={zoomOut}
                className="h-5 w-5 rounded border flex items-center justify-center transition-colors"
                style={{borderColor: HAVEN_COLORS.border, color: HAVEN_COLORS.text, backgroundColor: 'transparent'}}
                title="Zoom out"
              >
                <MinusIcon className="h-3 w-3" />
              </button>
              <button
                onClick={zoomIn}
                className="h-5 w-5 rounded border flex items-center justify-center transition-colors"
                style={{borderColor: HAVEN_COLORS.border, color: HAVEN_COLORS.text, backgroundColor: 'transparent'}}
                title="Zoom in"
              >
                <PlusIcon className="h-3 w-3" />
              </button>
              <button
                onClick={centerOnRobot}
                className="h-5 w-5 rounded border flex items-center justify-center transition-colors"
                style={{borderColor: HAVEN_COLORS.border, color: HAVEN_COLORS.text, backgroundColor: 'transparent'}}
                title="Center"
              >
                <Crosshair className="h-3 w-3" />
              </button>
            </div>
          </div>
          {(() => {
            const mapSize = 20
            const posFromSim = statusInfo?.position
            const sx = Array.isArray(posFromSim) ? posFromSim[0] : posFromSim?.x
            const sy = Array.isArray(posFromSim) ? posFromSim[1] : posFromSim?.y
            const rxFromRobot = robot?.position?.x
            const ryFromRobot = robot?.position?.y
            const rawX = (sx !== undefined && sx !== null) ? sx : ((rxFromRobot !== undefined && rxFromRobot !== null) ? rxFromRobot : undefined)
            const rawY = (sy !== undefined && sy !== null) ? sy : ((ryFromRobot !== undefined && ryFromRobot !== null) ? ryFromRobot : undefined)
            const toPercent = (v, invert = false) => {
              const n = Number(v)
              if (!Number.isFinite(n)) return '50%'
              if (n <= 1 && n >= 0) return `${invert ? (100 - n * 100) : (n * 100)}%`
              if (n <= 50 && n >= 0) {
                const p = (n / 50) * 100
                return `${invert ? (100 - p) : p}%`
              }
              if (n <= 100 && n >= 0) {
                const p = (n / 100) * 100
                return `${invert ? (100 - p) : p}%`
              }
              const idx = Math.max(0, Math.min(mapSize - 1, Math.round(n)))
              const p = (idx / (mapSize - 1)) * 100
              return `${invert ? (100 - p) : p}%`
            }
            const sizeToPercent = (s) => {
              const n = Number(s)
              const cellPct = 100 / mapSize
              if (!Number.isFinite(n)) return `${cellPct}%`
              const cells = Math.max(0.1, Math.min(mapSize, n))
              return `${cells * cellPct}%`
            }
            const hasCoords = Number.isFinite(Number(rawX)) && Number.isFinite(Number(rawY))
            const leftPercent = hasCoords ? toPercent(rawX, false) : '50%'
            const topPercent = hasCoords ? toPercent(rawY, true) : '50%'
            const robotW = sizeToPercent(robotSizeX)
            const robotH = sizeToPercent(robotSizeY)
            const gridColor = 'rgba(71,85,105,0.35)'
            const bgStyle = {
              backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
              backgroundSize: `${100 / mapSize}% ${100 / mapSize}%`,
              backgroundPosition: '0 0',
            }
            return (
              <div
                ref={mapOuterRef}
                className="relative rounded overflow-auto flex-1"
                style={{
                  border: `1px solid ${HAVEN_COLORS.border}`,
                  backgroundColor: HAVEN_COLORS.elevated
                }}
              >
                <div className="relative w-full h-full">
                  <div
                    ref={mapInnerRef}
                    className="absolute top-0 left-0 overflow-hidden"
                    style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                  >
                    <div className="absolute inset-0 z-0" style={bgStyle} />
                    <div className="absolute inset-0 z-10">
                      {objectList.map((obj, idx) => {
                        const ox = Number(obj?.x_pos)
                        const oy = Number(obj?.y_pos)
                        const osx = Number(obj?.x_size || 1)
                        const osy = Number(obj?.y_size || 1)
                        if (!Number.isFinite(ox) || !Number.isFinite(oy)) return null
                        const left = toPercent(ox, false)
                        const top = toPercent(oy, true)
                        const width = sizeToPercent(osx)
                        const height = sizeToPercent(osy)
                        return (
                          <div
                            key={idx}
                            title={obj?.id || 'object'}
                            className="absolute"
                            style={{
                              left,
                              top,
                              width,
                              height,
                              backgroundImage: 'url(/assets/BOX.png)',
                              backgroundSize: 'contain',
                              backgroundPosition: 'center',
                              backgroundRepeat: 'no-repeat',
                              imageRendering: 'crisp-edges'
                            }}
                          />
                        )
                      })}
                      <div
                        className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
                        style={{
                          left: leftPercent,
                          top: topPercent,
                          width: robotW,
                          height: robotH,
                          transition: 'left 300ms ease, top 300ms ease',
                          willChange: 'left, top'
                        }}
                      >
                        <div
                          className={`w-full h-full rounded-full overflow-hidden ring-2 ${
                            collision ? 'ring-red-500' : 'ring-slate-300/40'
                          } shadow`}
                        >
                          <img
                            src={safeImageUrl(tokenData.image)}
                            alt="robot"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export default CompactControlPanel