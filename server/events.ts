import type { Response } from 'express'
import { currentUid } from './ctx'

// Server-sent events hub: every open board gets live updates, each user only their own.
const clients = new Map<Response, number>()

export function addClient(res: Response, uid: number) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 2000\n\n')
  clients.set(res, uid)
  const ping = setInterval(() => res.write(': ping\n\n'), 20000)
  res.on('close', () => {
    clearInterval(ping)
    clients.delete(res)
  })
}

/** Send to one user's boards: `to`, or else the user the current request works for. Outside a request it goes to nobody. */
export function broadcast(type: string, data: unknown, to: number | undefined = currentUid()) {
  if (to === undefined) return
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const [c, u] of clients) if (u === to) c.write(msg)
}

/** Server-wide news every signed-in board shows (Claude accounts, the Claude sign-in). */
export function broadcastAll(type: string, data: unknown) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const c of clients.keys()) c.write(msg)
}
