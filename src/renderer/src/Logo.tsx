/**
 * Tiger's mascot — an orange cat, drawn entirely in code so it scales cleanly
 * from a 16px tab favicon to a 1024px app icon. The same markup is rendered to
 * PNG/ICNS by scripts/generate-icon.mjs.
 */
export function Logo({ size = 26, rounded = false }: { size?: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label="Tiger">
      <defs>
        <linearGradient id="tg-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffab46" />
          <stop offset="1" stopColor="#f25c06" />
        </linearGradient>
        <linearGradient id="tg-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4e7" />
          <stop offset="1" stopColor="#ffdfc0" />
        </linearGradient>
      </defs>

      {rounded && <rect x="6" y="6" width="244" height="244" rx="58" fill="url(#tg-bg)" />}

      {/* ears */}
      <path d="M66 98 L74 38 L122 80 Z" fill="#ff7a18" stroke="#d75800" strokeWidth="4" strokeLinejoin="round" />
      <path d="M190 98 L182 38 L134 80 Z" fill="#ff7a18" stroke="#d75800" strokeWidth="4" strokeLinejoin="round" />
      <path d="M80 86 L85 56 L108 80 Z" fill="#ffc090" />
      <path d="M176 86 L171 56 L148 80 Z" fill="#ffc090" />

      {/* head */}
      <path
        d="M128 68 C178 68 198 104 198 146 C198 191 167 214 128 214 C89 214 58 191 58 146 C58 104 78 68 128 68 Z"
        fill="url(#tg-face)"
        stroke="#ef6a12"
        strokeWidth="5"
      />

      {/* tiger stripes */}
      <g stroke="#ff7a18" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M128 78 L128 106" />
        <path d="M110 82 L104 104" />
        <path d="M146 82 L152 104" />
        <path d="M70 134 L86 140" />
        <path d="M70 152 L86 154" />
        <path d="M186 134 L170 140" />
        <path d="M186 152 L170 154" />
      </g>

      {/* eyes */}
      <ellipse cx="104" cy="142" rx="11.5" ry="14.5" fill="#2a1c12" />
      <ellipse cx="152" cy="142" rx="11.5" ry="14.5" fill="#2a1c12" />
      <circle cx="108.5" cy="137" r="3.6" fill="#fff" />
      <circle cx="156.5" cy="137" r="3.6" fill="#fff" />

      {/* nose + mouth */}
      <path d="M119 164 L137 164 L128 174 Z" fill="#ff6a6a" stroke="#d94f4f" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M128 174 L128 182 M128 182 C121 190 113 186 111 180 M128 182 C135 190 143 186 145 180"
        stroke="#b06a3a"
        strokeWidth="3.4"
        fill="none"
        strokeLinecap="round"
      />

      {/* whiskers */}
      <g stroke="#dd9255" strokeWidth="3.2" strokeLinecap="round">
        <path d="M88 160 L50 152" />
        <path d="M88 170 L50 172" />
        <path d="M168 160 L206 152" />
        <path d="M168 170 L206 172" />
      </g>
    </svg>
  )
}
