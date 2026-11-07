// In-app Claude login: runs `claude auth login` in the background, hands the sign-in link
// to the board, and forwards the code the user pastes. No terminal window needed.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { broadcastAll as broadcast } from '../events'

export interface LoginState {
  phase: 'idle' | 'starting' | 'waiting_code' | 'verifying' | 'done' | 'error'
  /** Which Talvis account is being signed in. */
  accountId?: string
  url?: string
  message?: string
}

let proc: ChildProcessWithoutNullStreams | null = null
let state: LoginState = { phase: 'idle' }
let killTimer: NodeJS.Timeout | null = null

function set(next: LoginState) {
  state = next
  broadcast('login', state)
}

export function loginState(): LoginState {
  return state
}

/** The Claude binary bundled with the Agent SDK (the one the chat uses), else `claude` on PATH. */
function claudeBinary(): string {
  try {
    const req = createRequire(import.meta.url)
    const pkg = req.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)
    const bin = path.join(path.dirname(pkg), process.platform === 'win32' ? 'claude.exe' : 'claude')
    if (fs.existsSync(bin)) return bin
  } catch {
    // platform package missing: fall back to PATH
  }
  return 'claude'
}

export function startLogin(env: NodeJS.ProcessEnv, accountId: string, onDone: () => void): LoginState {
  cancelLogin()
  set({ phase: 'starting', accountId, message: 'Preparing the Claude sign-in page...' })
  let out = ''
  const p = spawn(claudeBinary(), ['auth', 'login', '--claudeai'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  proc = p
  const onData = (d: Buffer) => {
    const chunk = d.toString()
    out += chunk
    const url = out.match(/https:\/\/\S+\/oauth\/authorize\?\S+/)?.[0]
    if (url && state.phase === 'starting') set({ phase: 'waiting_code', accountId, url })
    // A rejected code makes the CLI print an error and/or ask again.
    else if (state.phase === 'verifying' && /invalid|error|failed|paste code/i.test(chunk))
      set({ phase: 'waiting_code', accountId, url: state.url, message: `Code not accepted: ${chunk.replace(/\s+/g, ' ').trim().slice(0, 160)}` })
  }
  p.stdout.on('data', onData)
  p.stderr.on('data', onData)
  p.on('error', (e) => {
    if (proc === p) set({ phase: 'error', accountId, message: `Could not start the Claude program: ${e.message}` })
  })
  p.on('exit', (code) => {
    if (proc !== p) return
    proc = null
    if (killTimer) clearTimeout(killTimer)
    const tail = out.replace(/https:\/\/\S+/g, '').trim().split('\n').slice(-3).join(' ').slice(0, 300)
    if (code === 0) set({ phase: 'done', accountId, message: 'Signed in to your Claude account.' })
    else if (state.phase !== 'idle') set({ phase: 'error', accountId, message: tail || `Sign-in failed (code ${code}).` })
    onDone()
  })
  // An abandoned login should not keep a process around.
  killTimer = setTimeout(() => {
    if (proc === p) {
      p.kill()
      set({ phase: 'error', accountId, message: 'Timed out. Press "Connect to Claude" again.' })
    }
  }, 15 * 60_000)
  return state
}

export function submitCode(code: string): LoginState {
  const clean = code.trim()
  if (!proc || state.phase !== 'waiting_code') return state
  if (!clean) return state
  proc.stdin.write(`${clean}\n`)
  set({ ...state, phase: 'verifying', message: 'Checking the code...' })
  return state
}

export function cancelLogin() {
  if (proc) {
    const p = proc
    proc = null
    p.kill()
  }
  if (killTimer) clearTimeout(killTimer)
  set({ phase: 'idle' })
}
