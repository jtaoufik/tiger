import { useId } from 'react'
import { Logo } from '../Logo'
import {
  CheckIcon,
  ClockIcon,
  FileIcon,
  FolderOpenIcon,
  GearIcon,
  GitBranchIcon,
  GlobeIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon
} from './Icons'
import { MOD } from './ShortcutsModal'
import { getAction } from '@core/actions'
import { actionTitle } from '../actions'
import { HelpLink } from './HelpLink'
import './WelcomeView.css'

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
  /** Progress of the three getting-started steps. */
  hasCollection?: boolean
  hasRequestOpen?: boolean
  hasSent?: boolean
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
  canCreateRequest = true,
  hasCollection = false,
  hasRequestOpen = false,
  hasSent = false
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
      title: getAction('new-collection').label,
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
      icon: <UploadIcon size={22} />,
      title: getAction('import').label,
      desc: 'Bring in Postman, Insomnia, Bruno or OpenAPI.',
      onClick: onImportExport
    }
  ]

  const tiles = [
    {
      icon: <PlusIcon size={20} />,
      title: getAction('new-request').label,
      desc: canCreateRequest
        ? 'Start from scratch in your first collection.'
        : 'Open or create a collection first.',
      onClick: onNewRequest,
      disabled: !canCreateRequest
    },
    {
      icon: <SearchIcon size={20} />,
      title: getAction('command-palette').label,
      desc: `${MOD}+K finds any request or command by name.`,
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
      title: getAction('environments').label,
      desc: 'Switch dev, staging and prod with {{variables}}.',
      onClick: onEnvironments
    },
    {
      icon: <ClockIcon size={20} />,
      title: getAction('history').label,
      desc: 'Your last 200 sends with status and timing.',
      onClick: onHistory
    },
    {
      icon: <GearIcon size={20} />,
      title: getAction('settings').label,
      desc: 'Theme, proxy, SSL, timeouts, AI assistants and privacy.',
      onClick: onSettings
    }
  ]

  const steps = [
    {
      title: 'Open or create a collection',
      hint: 'A collection is a folder of .tiger files. Use a card below.',
      done: hasCollection
    },
    {
      title: 'Pick a request',
      hint: `Click one in the sidebar, or ${actionTitle('new-request')}.`,
      done: hasRequestOpen
    },
    {
      title: 'Send it',
      hint: `${actionTitle('send')}. The response shows below the request.`,
      done: hasSent
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

      <section className="welcome-steps" aria-labelledby={`${uid}-steps`}>
        <div className="welcome-steps-head">
          <h3 className="welcome-section-label" id={`${uid}-steps`}>
            Getting started
          </h3>
          <HelpLink page="first-request" topic="Your first request" />
        </div>
        <ol className="welcome-step-list">
          {steps.map((step, i) => (
            <li key={step.title} className={`welcome-step${step.done ? ' done' : ''}`}>
              <span className="welcome-step-num" aria-hidden="true">
                {step.done ? <CheckIcon size={13} /> : i + 1}
              </span>
              <span className="welcome-step-text">
                <span className="t">
                  {step.title}
                  {step.done && <span className="tg-sr-only"> (done)</span>}
                </span>
                <span className="d">{step.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

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
