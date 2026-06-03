/**
 * Tiger's icon set: one homogeneous family of stroke icons (SF-Symbols-like:
 * 1.8px stroke, round caps, 24px grid) so the UI reads the same on macOS and
 * Windows. Always use these instead of emoji or unicode glyphs.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const ChevronIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 6l6 6-6 6" />
  </Base>
)

export const FolderIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 7c0-1.1.9-2 2-2h3.6l2 2.2h7.4c1.1 0 2 .9 2 2V17c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2V7z" />
  </Base>
)

export const FolderOpenIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 7c0-1.1.9-2 2-2h3.6l2 2.2h6.9c1.1 0 2 .9 2 2V10" />
    <path d="M5.6 10h14.2c.9 0 1.5.9 1.2 1.7l-1.9 5.9c-.3.8-1 1.4-1.9 1.4H5.5c-1.1 0-2-.9-2-2v-5.2c0-1 .9-1.8 2.1-1.8z" />
  </Base>
)

export const FileIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3.5h7l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1-1.5z" />
    <path d="M13 3.5V9h5" />
  </Base>
)

export const GearIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.9 1.9M7.4 16.6l-1.9 1.9M18.5 18.5l-1.9-1.9M7.4 7.4L5.5 5.5" />
  </Base>
)

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
)

export const GlobeIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5z" />
  </Base>
)

export const SwapIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M16 4l4 4-4 4M20 8H7M8 12l-4 4 4 4M4 16h13" />
  </Base>
)

export const CodeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
  </Base>
)

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
)

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
)

export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
    <path d="M10 10.5v5.5M14 10.5v5.5" />
  </Base>
)

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21" />
  </Base>
)

export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
  </Base>
)

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Base>
)

export const PencilIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20l1.2-4.2L16.6 4.4a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.2 18.8 4 20z" />
    <path d="M14.5 6.5l3 3" />
  </Base>
)

export const DownloadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v10M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4.5 16.5V18A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
  </Base>
)

export const UploadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 15V5M7.5 9.5L12 5l4.5 4.5" />
    <path d="M4.5 16.5V18A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
  </Base>
)

export const SaveIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 3.5h11l3.5 3.5v11a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V5A1.5 1.5 0 0 1 5 3.5z" />
    <path d="M7.5 3.5V8h7V3.5M7.5 19.5V14h9v5.5" />
  </Base>
)
