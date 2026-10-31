// Copy the local board (data/phd.db and Claude logins in data/accounts) into Postgres.
//   DATABASE_URL=postgres://... npm run db:push [-- --force] [--logins | --logins-only]
// Without --force it refuses when Postgres already holds Talvis data.
// --logins also uploads the Talvis Claude logins (data/accounts/*; not ~/.claude). A login used in two places
// may need signing in again on one side when its token refreshes.
import { closePg, pushAll, pushLoginFiles } from '../server/pgsync'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL lazımdır')
  process.exit(1)
}
try {
  if (!process.argv.includes('--logins-only')) {
    await pushAll({ force: process.argv.includes('--force') })
    console.log('Hazırdır: lokal data Postgres-ə köçürüldü.')
  }
  if (process.argv.includes('--logins') || process.argv.includes('--logins-only')) {
    const files = await pushLoginFiles()
    console.log(`Claude girişləri köçürüldü: ${files.join(', ') || 'heç biri tapılmadı'}`)
  }
} catch (e) {
  console.error(`Xəta: ${(e as Error).message}`)
  process.exitCode = 1
} finally {
  await closePg()
}
