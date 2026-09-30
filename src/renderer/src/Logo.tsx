import tiger from './assets/tiger-logo.png'

/**
 * Tiger's mascot. The artwork's source of truth is scripts/icon-source.png
 * (also the app icon). assets/tiger-logo.png is a 128 px export of it: the
 * largest logo in the UI is 56 CSS px (112 device px on Retina), and the
 * 1024 px original cost 890 KB to load and decode on every launch. Regenerate
 * with `sips -Z 128 scripts/icon-source.png --out src/renderer/src/assets/tiger-logo.png`.
 * The image already includes
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
