/**
 * Tiger's mascot, an orange tiger cat. The artwork's source of truth is
 * scripts/icon-mark.svg (also used to build the app icon); keep this JSX in
 * sync with it. `rounded` draws the warm tile behind the head, matching the
 * app icon.
 */
export function Logo({ size = 26, rounded = false }: { size?: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label="Tiger">
      {rounded && (
        <defs>
          <linearGradient id="tg-tile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff7ec" />
            <stop offset="1" stopColor="#ffe9cf" />
          </linearGradient>
        </defs>
      )}
      {rounded && <rect x="4" y="4" width="248" height="248" rx="58" fill="url(#tg-tile)" />}
      <g transform={rounded ? 'translate(16 16) scale(0.875)' : undefined}>
        <path
          fill="#ff7a18"
          stroke="#171717"
          strokeWidth="14"
          strokeLinejoin="round"
          d="M43 112 28 35l57 30c13-8 28-12 43-12s30 4 43 12l57-30-15 77c10 16 15 35 15 55 0 51-41 79-100 79s-100-28-100-79c0-20 5-39 15-55Z"
        />
        <path
          fill="#ff9a2f"
          d="M72 96c14-16 34-25 56-25s42 9 56 25c14 16 21 39 21 70 0 42-31 62-77 62s-77-20-77-62c0-31 7-54 21-70Z"
        />
        <path
          fill="#171717"
          d="M42 55 77 76 50 94Zm172 0-35 21 27 18ZM119 58h18l-9 35Zm-33 9 16 7-25 31Zm84 0 9 38-25-31Z"
        />
        <path
          fill="#c94f0b"
          d="M120 89h16l-8 44Zm-37 22 14-7 18 34-17 5Zm90 0-15-7-17 34 17 5ZM54 151l39 7-7 16-33-6Zm148 0-39 7 7 16 33-6ZM64 190l32-9 3 16-28 11Zm128 0-32-9-3 16 28 11Z"
        />
        <path
          fill="#ffe1b8"
          stroke="#171717"
          strokeWidth="9"
          strokeLinejoin="round"
          d="M128 149c31 0 55 18 55 43 0 30-24 45-55 45s-55-15-55-45c0-25 24-43 55-43Z"
        />
        <path
          fill="#fff0d2"
          d="M97 163c12 0 23 9 25 23-18 2-36-4-43-16 4-4 10-7 18-7Zm62 0c-12 0-23 9-25 23 18 2 36-4 43-16-4-4-10-7-18-7Z"
        />
        <path
          fill="#171717"
          d="M88 128c8-9 22-9 31 0-7 7-23 7-31 0Zm49 0c9-9 23-9 31 0-8 7-24 7-31 0Z"
        />
        <path
          fill="#171717"
          d="M101 123a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm54 0a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"
        />
        <path
          fill="#ff7aa2"
          stroke="#171717"
          strokeWidth="7"
          strokeLinejoin="round"
          d="M128 176 112 164h32Z"
        />
        <path
          fill="none"
          stroke="#171717"
          strokeWidth="7"
          strokeLinecap="round"
          d="M128 176v17m0 0c-9 9-23 9-32 0m32 0c9 9 23 9 32 0"
        />
      </g>
    </svg>
  )
}
