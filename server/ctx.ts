// The signed-in user a request (and everything it starts: chat, jobs, agent tools) works for.
// Board data is scoped by this id; code that runs outside a request (start-up, Claude accounts) has none.
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage<{ uid: number }>()

/** Run fn (and every async continuation it starts) as user uid. */
export const runAs = <T>(uid: number, fn: () => T): T => als.run({ uid }, fn)

/** The current user's id, or undefined outside a signed-in request. */
export const currentUid = (): number | undefined => als.getStore()?.uid

/** The current user's id; board data can only be read or written for a signed-in user. */
export function uid(): number {
  const u = currentUid()
  if (u === undefined) throw new Error('No signed-in user')
  return u
}
