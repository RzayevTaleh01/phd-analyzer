import type { ModuleKey } from '../../../shared/types'

// Neural-net style layers: outer modules -> inner modules -> CORE (center).
export interface Box { x: number; y: number; w: number; h: number }

const W = 300
const H = 236
const GAP_Y = 36
const R1 = -390
const R2 = R1 + H + GAP_Y
const R3 = R2 + H + GAP_Y
const OL = -938
const IL = -594
const IR = 294
const OR = 638

export const CORE_BOX: Box = { x: -250, y: -390, w: 500, h: 780 }

export const DEFAULT_LAYOUT: Record<Exclude<ModuleKey, 'core'>, Box> = {
  profile: { x: OL, y: R1, w: W, h: H },
  deadlines: { x: OL, y: R2, w: W, h: H },
  documents: { x: OL, y: R3, w: W, h: H },
  universities: { x: IL, y: R1, w: W, h: H },
  today: { x: IL, y: R2, w: W, h: H * 2 + GAP_Y },
  topics: { x: IR, y: R1, w: W, h: H },
  papers: { x: IR, y: R2, w: W, h: H },
  gaps: { x: IR, y: R3, w: W, h: H },
  groups: { x: OR, y: R1, w: W, h: H },
  researchers: { x: OR, y: R2, w: W, h: H },
  publish: { x: OR, y: R3, w: W, h: H },
}

// Edges point toward the core: information flows inward.
export const LINKS: [ModuleKey, ModuleKey][] = [
  ['profile', 'universities'],
  ['profile', 'today'],
  ['deadlines', 'universities'],
  ['deadlines', 'today'],
  ['documents', 'today'],
  ['documents', 'universities'],
  ['universities', 'core'],
  ['today', 'core'],
  ['groups', 'topics'],
  ['groups', 'researchers'],
  ['researchers', 'topics'],
  ['researchers', 'papers'],
  ['publish', 'gaps'],
  ['publish', 'papers'],
  ['topics', 'papers'],
  ['papers', 'gaps'],
  ['topics', 'core'],
  ['papers', 'core'],
  ['gaps', 'core'],
]

// Route used to light up the path from a module to the core.
const ROUTE: Partial<Record<ModuleKey, ModuleKey>> = {
  profile: 'universities',
  deadlines: 'today',
  documents: 'today',
  groups: 'topics',
  researchers: 'papers',
  publish: 'gaps',
}

export function activeEdgeIds(live: ModuleKey[]): Set<string> {
  const ids = new Set<string>()
  for (const k of live) {
    if (k === 'core') continue
    const via = ROUTE[k]
    if (via) {
      ids.add(`${k}->${via}`)
      ids.add(`${via}->core`)
    } else {
      ids.add(`${k}->core`)
    }
  }
  return ids
}
