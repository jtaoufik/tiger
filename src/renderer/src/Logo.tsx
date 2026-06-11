import tiger from './assets/tiger.png'

/**
 * Tiger's mascot. The artwork's source of truth is scripts/icon-source.png
 * (same file as assets/tiger.png and the app icon). The image already includes
 * the rounded warm tile, so `rounded` only affects nothing visually but is
 * kept for API compatibility with existing call sites.
 */
export function Logo({ size = 26 }: { size?: number; rounded?: boolean }) {
  return (
    <img
      src={tiger}
      width={size}
      height={size}
      alt="Tiger"
      draggable={false}
      style={{ display: 'block' }}
    />
  )
}
