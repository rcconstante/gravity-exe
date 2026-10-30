import { useRef, useState } from 'react'
import { Clock3, FlaskConical, Orbit, Zap } from 'lucide-react'
import { GravityControls } from './GravityControls'
import { TimeMachineControls } from './TimeMachineControls'
import { ExperimentControls, triggerChaos } from './ExperimentControls'
import { useUI } from '../lib/store'

type Tab = 'gravity' | 'time' | 'tools'

const TABS: { id: Tab; label: string; icon: typeof Orbit }[] = [
  { id: 'gravity', label: 'Gravity', icon: Orbit },
  { id: 'time', label: 'Time', icon: Clock3 },
  { id: 'tools', label: 'Tools', icon: FlaskConical },
]

/**
 * Floating control dock. On desktop all three modules sit side by side; on
 * small screens they collapse into a tray with tabs and a persistent CHAOS key.
 */
export function ControlDock() {
  const [tab, setTab] = useState<Tab>('gravity')
  const live = useUI((s) => s.timeMode === 'live')
  const chaosRef = useRef<HTMLButtonElement>(null)

  return (
    <nav className="dock" aria-label="Physics controls" data-tab={tab}>
      <div className="dock__modules">
        <div className="dock__slot" id="controls-gravity" data-slot="gravity">
          <GravityControls />
        </div>
        <div className="dock__slot" id="controls-time" data-slot="time">
          <TimeMachineControls />
        </div>
        <div className="dock__slot" id="controls-tools" data-slot="tools">
          <ExperimentControls />
        </div>
      </div>

      <div className="tray" role="group" aria-label="Control groups">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            aria-controls={`controls-${id}`}
            className={`tray__tab ${tab === id ? 'is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
        <button
          ref={chaosRef}
          type="button"
          className="chaos-btn chaos-btn--tray"
          disabled={!live}
          onClick={() => triggerChaos(chaosRef.current)}
          aria-label="Chaos"
        >
          <Zap size={15} strokeWidth={2} aria-hidden="true" />
          <span>CHAOS</span>
        </button>
      </div>
    </nav>
  )
}
