// Entry point: with DATABASE_URL, fill the local working copy from Postgres before the server loads.
import { restore } from './pgsync'

await restore()
await import('./index')
