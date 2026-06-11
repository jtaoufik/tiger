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

interface Props {
  version: string
  onOpenCollection: () => void
  onImportExport: () => void
  onNewRequest: () => void
  onPalette: () => void
  onHistory: () => void
  onEnvironments: () => void
  onSettings: () => void
  onGit: () => void
}

/** The home screen: every major feature one click away. */
export function WelcomeView({
  version,
  onOpenCollection,
  onImportExport,
  onNewRequest,
  onPalette,
  onHistory,
  onEnvironments,
  onSettings,
  onGit
}: Props) {
  const tiles = [
    {
      icon: <FolderOpenIcon size={20} />,
      title: 'Open a collection',
      desc: 'Any folder of .tiger files, straight from disk.',
      onClick: onOpenCollection
    },
    {
      icon: <SwapIcon size={20} />,
      title: 'Import / Export',
      desc: 'Postman, Insomnia, Bruno, OpenAPI in. Postman and curl out.',
      onClick: onImportExport
    },
    {
      icon: <PlusIcon size={20} />,
      title: 'New request',
      desc: 'Start from scratch in the demo collection.',
      onClick: onNewRequest
    },
    {
      icon: <SearchIcon size={20} />,
      title: 'Jump anywhere',
      desc: 'Cmd+K finds any request across collections.',
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

  return (
    <section className="panel welcome">
      <div className="welcome-head">
        <Logo size={56} />
        <div>
          <h2>Welcome to Tiger</h2>
          <p>The API client that lives in your repos. Everything below is one click away.</p>
        </div>
      </div>
      <div className="welcome-grid">
        {tiles.map((tile) => (
          <button className="welcome-tile" key={tile.title} onClick={tile.onClick}>
            {tile.icon}
            <span className="t">{tile.title}</span>
            <span className="d">{tile.desc}</span>
          </button>
        ))}
      </div>
      <div className="welcome-foot">
        <FileIcon size={13} /> Requests are plain .tiger files: branch them, review them, own them.
        <span style={{ flex: 1 }} />
        v{version}
      </div>
    </section>
  )
}
