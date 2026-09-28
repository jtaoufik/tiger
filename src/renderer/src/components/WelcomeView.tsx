import { useId } from 'react'
import { Logo } from '../Logo'
import {
  ClockIcon,
  FileIcon,
  FolderOpenIcon,
  GearIcon,
  GitBranchIcon,
  GlobeIcon,
  PlusIcon,
  SearchIcon,
  SwapIcon
} from './Icons'
import { MOD } from './ShortcutsModal'

interface Props {
  version: string
  onOpenCollection: () => void
  onNewCollection: () => void
  onClone: () => void
  onImportExport: () => void
  onNewRequest: () => void
  onPalette: () => void
  onHistory: () => void
  onEnvironments: () => void
  onSettings: () => void
  onGit: () => void
  /** False when no collection is open: "New request" then explains why. */
  canCreateRequest?: boolean
}

/** The home screen: every major feature one click away. */
export function WelcomeView({
  version,
  onOpenCollection,
  onNewCollection,
  onClone,
  onImportExport,
  onNewRequest,
  onPalette,
  onHistory,
  onEnvironments,
  onSettings,
  onGit,
  canCreateRequest = true
}: Props) {
  const uid = useId()
  // The ways to get a collection in front of you. These lead the screen.
  const primary = [
    {
      icon: <FolderOpenIcon size={22} />,
      title: 'Open a collection',
      desc: 'Any folder of .tiger files, straight from disk.',
      onClick: onOpenCollection
    },
    {
      icon: <PlusIcon size={22} />,
      title: 'New collection',
      desc: 'Create an empty collection folder on your machine.',
      onClick: onNewCollection
    },
    {
      icon: <GitBranchIcon size={22} />,
      title: 'Clone from Git',
      desc: 'Pull a team collection from a repository URL.',
      onClick: onClone
    },
    {
      icon: <SwapIcon size={22} />,
      title: 'Import',
      desc: 'Bring in Postman, Insomnia, Bruno or OpenAPI.',
      onClick: onImportExport
    }
  ]

  const tiles = [
    {
      icon: <PlusIcon size={20} />,
      title: 'New request',
      desc: canCreateRequest
        ? 'Start from scratch in your first collection.'
        : 'Open or create a collection first.',
      onClick: onNewRequest,
      disabled: !canCreateRequest
    },
    {
      icon: <SearchIcon size={20} />,
      title: 'Jump anywhere',
      desc: `${MOD}+K finds any request across collections.`,
      onClick: onPalette
    },
    {
      icon: <GitBranchIcon size={20} />,
      title: 'Sync with your team',
      desc: 'One button shares changes and fetches updates via Git.',
      onClick: onGit
    },
    {
      icon: <GlobeIcon size={20} />,
      title: 'Environments',
      desc: 'Switch dev, staging and prod with {{variables}}.',
      onClick: onEnvironments
    },
    {
      icon: <ClockIcon size={20} />,
      title: 'History',
      desc: 'Your last 200 sends with status and timing.',
      onClick: onHistory
    },
    {
      icon: <GearIcon size={20} />,
      title: 'Settings',
      desc: 'Theme, proxy, SSL, timeouts and privacy.',
      onClick: onSettings
    }
  ]

  // Tiles are named by their title and described by their blurb, so screen
  // readers hear "Open a collection, button" then the detail, not one run-on.
  const descId = (title: string) => `${uid}-${title.replace(/\W+/g, '-')}`

  return (
    <section className="panel welcome" aria-labelledby={`${uid}-title`}>
      <div className="welcome-head">
        <span aria-hidden>
          <Logo size={56} />
        </span>
        <div>
          <h2 id={`${uid}-title`}>Welcome to Tiger</h2>
          <p>The API client that lives in your repos. Start with a collection.</p>
        </div>
      </div>

      <h3 className="welcome-section-label">Start a collection</h3>
      <ul className="welcome-primary" role="list">
        {primary.map((tile) => (
          <li key={tile.title}>
            <button
              type="button"
              className="welcome-tile primary"
              onClick={tile.onClick}
              aria-describedby={descId(tile.title)}
            >
              <span className="chip">{tile.icon}</span>
              <span className="meta">
                <span className="t">{tile.title}</span>
                <span className="d" id={descId(tile.title)}>
                  {tile.desc}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h3 className="welcome-section-label">Tools</h3>
      <ul className="welcome-grid" role="list">
        {tiles.map((tile) => (
          <li key={tile.title}>
            <button
              type="button"
              className="welcome-tile"
              onClick={tile.disabled ? undefined : tile.onClick}
              aria-disabled={tile.disabled || undefined}
              aria-describedby={descId(tile.title)}
            >
              {tile.icon}
              <span className="t">{tile.title}</span>
              <span className="d" id={descId(tile.title)}>
                {tile.desc}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="welcome-foot">
        <FileIcon size={13} />
        <span>Requests are plain .tiger files: branch them, review them, own them.</span>
        <span style={{ flex: 1 }} />
        <span>Version {version}</span>
      </div>
    </section>
  )
}
