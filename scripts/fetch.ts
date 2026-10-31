// Command-line access to Talvis' web readers (JavaScript pages, Reddit, PhD portals).
//
//   npm run fetch -- page <url> [--browser] [--http] [--wait <css>] [--scroll] [--find "words"] [--links] [--json] [--out file]
//   npm run fetch -- reddit "<query>" [--sub PhD] [--sort top] [--time year] [--limit 20] [--json]
//   npm run fetch -- thread <reddit-url> [--limit 40] [--json]
//   npm run fetch -- subs "<name>"
//   npm run fetch -- portals "<field>" [--portal daad,jobsacuk] [--country Germany] [--json]
//   npm run fetch -- pdf <url> [--pages 1-3] [--find "words"] [--json] [--out file]
//   npm run fetch -- check            which browser works here
//
// Results are cached in the same database as the app (data/phd.db), so the app reuses them.
import fs from 'node:fs'
import { readPage, usefulJsonLd } from '../server/browser/read'
import { findInPdf, pageIndexes, readPdf } from '../server/browser/pdf'
import { browserStatus, closeBrowser } from '../server/browser/render'
import { PORTALS, searchPortals } from '../server/research/portals'
import { findSubreddits, redditSearch, redditThread } from '../server/research/reddit'

const argv = process.argv.slice(2)
const [cmd, target] = argv
const flag = (name: string) => argv.includes(`--${name}`)
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const num = (name: string) => (opt(name) ? Number(opt(name)) : undefined)

function emit(data: unknown, text: string) {
  const out = flag('json') ? JSON.stringify(data, null, 2) : text
  const file = opt('out')
  if (file) {
    fs.writeFileSync(file, out)
    console.log(`yazıldı: ${file}`)
  } else console.log(out)
}

function usage(): never {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'))
  process.exit(1)
}

async function main() {
  switch (cmd) {
    case 'page': {
      if (!target) usage()
      const mode = flag('browser') ? 'browser' : flag('http') ? 'http' : 'auto'
      const p = await readPage(target, { mode, waitFor: opt('wait'), scroll: flag('scroll'), cacheMs: flag('fresh') ? 0 : undefined })
      let text = p.text
      const find = opt('find')
      if (find) {
        const words = find.toLowerCase().split(/\s+/)
        text = text.split(/\n+/).filter((x) => words.some((w) => x.toLowerCase().includes(w))).join('\n')
      }
      const head = [`# ${p.title}`, `${p.finalUrl}  (${p.via}${p.status ? `, HTTP ${p.status}` : ''})`, p.blocked ? `!! Bloklandı: ${p.blocked}` : ''].filter(Boolean).join('\n')
      const links = flag('links') ? `\n\n## Linklər (${p.links.length})\n${p.links.map((l) => `- ${l.text} -> ${l.href}`).join('\n')}` : ''
      const ld = usefulJsonLd(p.jsonld)
      emit({ ...p, jsonld: ld }, `${head}\n\n${text}${links}${ld.length ? `\n\n## JSON-LD\n${JSON.stringify(ld, null, 1).slice(0, 4000)}` : ''}`)
      break
    }
    case 'pdf': {
      if (!target) usage()
      const d = await readPdf(target)
      const idx = pageIndexes(opt('pages'), d.pages)
      const find = opt('find')
      const body = find
        ? findInPdf(d, find, idx).map((h) => `[s.${h.page}] ${h.text}`).join('\n\n')
        : idx.map((i) => `--- səhifə ${i + 1} ---\n${d.text[i]}`).join('\n\n')
      emit(d, `# ${d.title ?? d.url}\n${d.url} · ${d.pages} səhifə${d.scanned ? ' · SKAN (mətn qatı yoxdur)' : ''}${d.author ? ` · ${d.author}` : ''}\n\n${body}`)
      break
    }
    case 'reddit': {
      if (!target) usage()
      const r = await redditSearch({ query: target, subreddit: opt('sub'), sort: opt('sort') as 'top', time: opt('time') as 'year', limit: num('limit') })
      emit(r, `${r.posts.length} post (${r.via})\n\n${r.posts.map((p) => `- [r/${p.subreddit}] ${p.title} (${p.created ?? '?'}${p.score !== undefined ? `, ${p.score}↑ ${p.comments} şərh` : ''})\n  ${p.url}${p.text ? `\n  ${p.text.slice(0, 220).replace(/\n/g, ' ')}` : ''}`).join('\n')}`)
      break
    }
    case 'thread': {
      if (!target) usage()
      const t = await redditThread(target, num('limit') ?? 40)
      emit(t, `# ${t.post?.title ?? '?'} (r/${t.post?.subreddit}, ${t.post?.created})\n${t.post?.text ?? ''}\n\n## Şərhlər (${t.comments.length}, ${t.via})\n${t.comments.map((c) => `${'  '.repeat(c.depth ?? 0)}- ${c.created ?? ''}${c.score !== undefined ? ` ${c.score}↑` : ''}: ${c.text.slice(0, 400).replace(/\n/g, ' ')}`).join('\n')}`)
      break
    }
    case 'subs': {
      if (!target) usage()
      const s = await findSubreddits(target)
      emit(s, s.map((x) => `- r/${x.name}: ${x.title}${x.subscribers ? ` (${x.subscribers} üzv)` : ''}\n  ${x.url}`).join('\n'))
      break
    }
    case 'portals': {
      if (!target) usage()
      const res = await searchPortals({ query: target, portals: opt('portal')?.split(','), country: opt('country'), limit: num('limit') })
      emit(
        res,
        res
          .map((r) =>
            r.mode === 'direct'
              ? `## ${r.name}: ${r.listings.length} nəticə\n${r.listings.map((l) => `- ${l.title}${l.university ? ` | ${l.university}` : ''}${l.deadline ? ` | deadline ${l.deadline}` : ''}\n  ${l.url}${l.snippet ? `\n  ${l.snippet.slice(0, 160)}` : ''}`).join('\n')}`
              : `## ${r.name}: birbaşa axtarılmır${r.error ? ` (${r.error})` : ''}\n  Brauzerdə aç: ${r.searchUrl}\n  Veb axtarış: ${r.webQuery}`,
          )
          .join('\n\n'),
      )
      break
    }
    case 'check': {
      const s = await browserStatus()
      console.log(s.ok ? `Brauzer işləyir: ${s.version} (ayar: ${s.channel})` : `Brauzer yoxdur: ${s.error}`)
      console.log(`Portallar: ${Object.entries(PORTALS).map(([k, p]) => `${k}${p.direct ? '' : ' (veb axtarış)'}`).join(', ')}`)
      break
    }
    default:
      usage()
  }
}

main()
  .catch((e) => {
    console.error(`Xəta: ${(e as Error).message}`)
    process.exitCode = 1
  })
  .finally(() => closeBrowser())
