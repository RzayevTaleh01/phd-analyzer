import type { Response } from 'express'

// Server-sent events hub: every open board gets live updates.
const clients = new Set<Response>()

export function addClient(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 2000\n\n')
  clients.add(res)
  const ping = setInterval(() => res.write(': ping\n\n'), 20000)
  res.on('close', () => {
    clearInterval(ping)
    clients.delete(res)
  })
}

export function broadcast(type: string, data: unknown) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const c of clients) c.write(msg)
}
