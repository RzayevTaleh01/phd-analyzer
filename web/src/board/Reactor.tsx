export default function Reactor({ size = 76 }: { size?: number }) {
  const ticks = Array.from({ length: 48 })
  return (
    <svg className="reactor" width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <filter id="rx-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(64,200,255,0.25)" strokeWidth="0.8" />
      <g className="rx-ring rx-spin-a">
        {ticks.map((_, i) => {
          const a = (i / ticks.length) * Math.PI * 2
          const r1 = i % 4 === 0 ? 40 : 42.5
          return (
            <line
              key={i}
              x1={50 + Math.cos(a) * r1} y1={50 + Math.sin(a) * r1}
              x2={50 + Math.cos(a) * 45} y2={50 + Math.sin(a) * 45}
              stroke="rgba(120,230,255,0.6)" strokeWidth={i % 4 === 0 ? 1.2 : 0.6}
            />
          )
        })}
      </g>
      <g className="rx-ring rx-spin-b">
        <circle cx="50" cy="50" r="35" fill="none" stroke="#2fd8ff" strokeWidth="1.6" strokeDasharray="34 6 8 6" opacity="0.85" />
      </g>
      <g className="rx-ring rx-spin-c">
        <circle cx="50" cy="50" r="27" fill="none" stroke="#93ecff" strokeWidth="2.4" strokeDasharray="22 6.3" opacity="0.7" />
      </g>
      <circle cx="50" cy="50" r="19" fill="rgba(47,216,255,0.12)" stroke="rgba(147,236,255,0.7)" strokeWidth="1" />
      <circle className="rx-core" cx="50" cy="50" r="10" fill="#c9f6ff" filter="url(#rx-glow)" />
    </svg>
  )
}
