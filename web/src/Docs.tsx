import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft } from 'lucide-react'
import guide from '../../docs/GUIDE.md?raw'
import Reactor from './board/Reactor'

/** Same anchors as GitHub, so the guide's links work both on GitHub and here. */
function slug(text: string) {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

const heading = (Tag: 'h1' | 'h2' | 'h3') =>
  function Heading({ children }: { children?: ReactNode }) {
    return <Tag id={slug(textOf(Children.toArray(children)))}>{children}</Tag>
  }

const SECTIONS = guide
  .split('\n')
  .filter((l) => l.startsWith('## ') && /^## \d/.test(l))
  .map((l) => l.slice(3).trim())

/** The public user guide at /docs: renders docs/GUIDE.md, so GitHub and the app show the same text. */
export default function Docs() {
  return (
    <div className="docs-page">
      <aside className="docs-nav">
        <a className="row docs-brand" href="/">
          <Reactor size={26} />
          <div>
            <div className="brand-title">PHD ANALYZER</div>
            <div className="brand-sub">USER GUIDE</div>
          </div>
        </a>
        <nav>
          {SECTIONS.map((s) => (
            <a key={s} href={`#${slug(s)}`}>{s}</a>
          ))}
        </nav>
        <a className="btn ghost sm" href="/"><ArrowLeft size={12} /> Open the app</a>
      </aside>
      <main className="docs-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: heading('h1'),
            h2: heading('h2'),
            h3: heading('h3'),
            // Links to other repository files only work on GitHub; here they stay plain text.
            a: ({ href, children }) =>
              !href || href.startsWith('#') ? <a href={href}>{children}</a>
              : /^https?:\/\//.test(href) ? <a href={href} target="_blank" rel="noreferrer">{children}</a>
              : <span>{children}</span>,
          }}
        >
          {guide}
        </ReactMarkdown>
      </main>
    </div>
  )
}
