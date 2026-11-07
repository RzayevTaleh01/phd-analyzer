import { Suspense, useEffect, type ComponentType, type CSSProperties, type LazyExoticComponent } from 'react'
import { lazyPage } from '../lib/lazy'
import { LoaderCircle, X } from 'lucide-react'
import type { ModuleKey } from '../../../shared/types'
import { MODULE_BY_KEY } from '../modules/registry'
import { useStore } from '../store'

// Each panel file is its own chunk and loads the first time one of its panels opens.
const apply = () => import('./ApplyPanels')
const research = () => import('./ResearchPanels')
const web = () => import('./WebPanels')
type Mod = Record<string, ComponentType>
const pick = (load: () => Promise<unknown>, name: string) => lazyPage(() => load().then((m) => ({ default: (m as Mod)[name] })))

const PANELS: Record<Exclude<ModuleKey, 'core'>, LazyExoticComponent<ComponentType>> = {
  profile: pick(apply, 'ProfilePanel'),
  universities: pick(apply, 'UniversitiesPanel'),
  deadlines: pick(apply, 'DeadlinesPanel'),
  today: pick(apply, 'TodayPanel'),
  documents: pick(apply, 'DocumentsPanel'),
  topics: pick(research, 'TopicsPanel'),
  groups: pick(research, 'GroupsPanel'),
  researchers: pick(research, 'ResearchersPanel'),
  papers: pick(research, 'PapersPanel'),
  gaps: pick(research, 'GapsPanel'),
  publish: pick(research, 'PublishPanel'),
  positions: pick(web, 'PositionsPanel'),
  insights: pick(web, 'InsightsPanel'),
  directions: lazyPage(() => import('./DirectionsPanel')),
}

export default function ModulePanel() {
  const { expanded, setExpanded } = useStore()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setExpanded])
  if (!expanded || expanded === 'core') return null
  const def = MODULE_BY_KEY[expanded]
  const Icon = def.icon
  const Panel = PANELS[expanded]
  return (
    <>
      <div className="panel-veil" onClick={() => setExpanded(null)} />
      <section className={`panel ${def.wide ? 'wide' : ''}`} style={{ '--accent': def.accent } as CSSProperties} aria-label={def.title}>
        <div className="panel-head">
          <span className="panel-icon"><Icon size={20} /></span>
          <div>
            <div className="panel-title">{def.title}</div>
            <div className="panel-desc">{def.desc}</div>
          </div>
          <div className="panel-actions">
            <button className="icon-btn" onClick={() => setExpanded(null)} title="Close (Esc)" aria-label="Close"><X size={17} /></button>
          </div>
        </div>
        <div className="panel-body">
          <Suspense fallback={<div className="panel-loading"><LoaderCircle size={20} className="spin" /></div>}>
            <Panel key={expanded} />
          </Suspense>
        </div>
      </section>
    </>
  )
}
