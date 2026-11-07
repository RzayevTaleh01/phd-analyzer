/** The PhD Analyzer mark: a graduation cap with a gold tassel, on a dark rounded square. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.68} height={size * 0.68} viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5 12 5l9 4.5-9 4.5z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        <path d="M7 11.6v3.9c0 1.5 2.2 2.7 5 2.7s5-1.2 5-2.7v-3.9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <path d="M19.5 10.3v5.2" stroke="#f5b82e" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="19.5" cy="17" r="1.8" fill="#f5b82e" />
      </svg>
    </span>
  )
}

export function Wordmark() {
  return (
    <span className="wordmark">
      PhD<span> Analyzer</span>
    </span>
  )
}

export default function Logo({ size }: { size?: number }) {
  return (
    <>
      <LogoMark size={size} />
      <Wordmark />
    </>
  )
}
