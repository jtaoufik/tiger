import { useId } from 'react'
import type { MessageKey } from '@core/i18n'
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
  UploadIcon,
  UsersIcon
} from './Icons'
import { MOD } from '../platform'
import { useT } from '../i18n'
import { actionLabel, actionTitle } from '../actions'
import { HelpLink } from './HelpLink'
import type { ImportKind } from '../../../main/importers'
import './WelcomeView.css'

interface Props {
  version: string
  onOpenCollection: () => void
  onNewCollection: () => void
  onClone: () => void
  onImportExport: () => void
  /**
   * Start one importer directly. When set, the "coming from another tool"
   * cards show (the app passes it on first run, before a real collection).
   */
  onImport?: (kind: ImportKind) => void
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

/** Per-tool export hints for people switching to Tiger (tool names are product names). */
const SWITCHERS: Array<{ kind: ImportKind; name: string; hintKey: MessageKey }> = [
  { kind: 'postman', name: 'Postman', hintKey: 'views.welcome.switch.postman' },
  { kind: 'insomnia', name: 'Insomnia', hintKey: 'views.welcome.switch.insomnia' },
  { kind: 'bruno', name: 'Bruno', hintKey: 'views.welcome.switch.bruno' }
]

/** The home screen: every major feature one click away. */
export function WelcomeView({
  version,
  onOpenCollection,
  onNewCollection,
  onClone,
  onImportExport,
  onImport,
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
  const t = useT()
  const uid = useId()
  // The ways to get a collection in front of you. These lead the screen.
  const primary = [
    {
      id: 'open',
      icon: <FolderOpenIcon size={22} />,
      title: t('views.welcome.primary.open.title'),
      desc: t('views.welcome.primary.open.desc'),
      onClick: onOpenCollection
    },
    {
      id: 'new',
      icon: <PlusIcon size={22} />,
      title: actionLabel('new-collection'),
      desc: t('views.welcome.primary.new.desc'),
      onClick: onNewCollection
    },
    {
      id: 'join',
      icon: <UsersIcon size={22} />,
      title: actionLabel('join-team'),
      desc: t('views.welcome.primary.join.desc'),
      onClick: onClone
    },
    {
      id: 'import',
      icon: <UploadIcon size={22} />,
      title: t('views.welcome.primary.import.title'),
      desc: t('views.welcome.primary.import.desc'),
      onClick: onImportExport
    }
  ]

  const tiles = [
    {
      id: 'request',
      icon: <PlusIcon size={20} />,
      title: actionLabel('new-request'),
      desc: canCreateRequest
        ? t('views.welcome.tile.request.desc')
        : t('views.welcome.tile.request.disabled'),
      onClick: onNewRequest,
      disabled: !canCreateRequest
    },
    {
      id: 'palette',
      icon: <SearchIcon size={20} />,
      title: actionLabel('command-palette'),
      desc: t('views.welcome.tile.palette.desc', { mod: MOD }),
      onClick: onPalette
    },
    {
      id: 'team',
      icon: <GitBranchIcon size={20} />,
      title: t('views.welcome.tile.team.title'),
      desc: t('views.welcome.tile.team.desc'),
      onClick: onGit
    },
    {
      id: 'env',
      icon: <GlobeIcon size={20} />,
      title: actionLabel('environments'),
      // i18n-ignore: variable syntax, passed as a value
      desc: t('views.welcome.tile.env.desc', { vars: '{{variables}}' }),
      onClick: onEnvironments
    },
    {
      id: 'history',
      icon: <ClockIcon size={20} />,
      title: actionLabel('history'),
      desc: t('views.welcome.tile.history.desc'),
      onClick: onHistory
    },
    {
      id: 'settings',
      icon: <GearIcon size={20} />,
      title: actionLabel('settings'),
      desc: t('views.welcome.tile.settings.desc'),
      onClick: onSettings
    }
  ]

  const steps = [
    {
      id: 'open',
      title: t('views.welcome.step.open.title'),
      hint: t('views.welcome.step.open.hint'),
      done: hasCollection
    },
    {
      id: 'pick',
      title: t('views.welcome.step.pick.title'),
      hint: t('views.welcome.step.pick.hint', { action: actionTitle('new-request') }),
      done: hasRequestOpen
    },
    {
      id: 'send',
      title: t('views.welcome.step.send.title'),
      hint: t('views.welcome.step.send.hint', { action: actionTitle('send') }),
      done: hasSent
    }
  ]

  // Tiles are named by their title and described by their blurb, so screen
  // readers hear "Open a collection, button" then the detail, not one run-on.
  const descId = (id: string) => `${uid}-desc-${id}`

  return (
    <section className="panel welcome" aria-labelledby={`${uid}-title`}>
      <div className="welcome-head">
        <span aria-hidden>
          <Logo size={56} />
        </span>
        <div>
          <h2 id={`${uid}-title`}>{t('views.welcome.title')}</h2>
          <p>{t('views.welcome.tagline')}</p>
        </div>
      </div>

      <section className="welcome-steps" aria-labelledby={`${uid}-steps`}>
        <div className="welcome-steps-head">
          <h3 className="welcome-section-label" id={`${uid}-steps`}>
            {t('views.welcome.stepsTitle')}
          </h3>
          <HelpLink page="first-request" topic={t('views.welcome.helpTopic')} />
        </div>
        <ol className="welcome-step-list">
          {steps.map((step, i) => (
            <li key={step.id} className={`welcome-step${step.done ? ' done' : ''}`}>
              <span className="welcome-step-num" aria-hidden="true">
                {step.done ? <CheckIcon size={13} /> : i + 1}
              </span>
              <span className="welcome-step-text">
                <span className="t">
                  {step.title}
                  {step.done && <span className="tg-sr-only"> {t('views.welcome.done')}</span>}
                </span>
                <span className="d">{step.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <h3 className="welcome-section-label">{t('views.welcome.startTitle')}</h3>
      <ul className="welcome-primary" role="list">
        {primary.map((tile) => (
          <li key={tile.id}>
            <button
              type="button"
              className="welcome-tile primary"
              onClick={tile.onClick}
              aria-describedby={descId(tile.id)}
            >
              <span className="chip">{tile.icon}</span>
              <span className="meta">
                <span className="t">{tile.title}</span>
                <span className="d" id={descId(tile.id)}>
                  {tile.desc}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {onImport && (
        <section className="welcome-switch" aria-labelledby={`${uid}-switch`}>
          <h3 className="welcome-section-label" id={`${uid}-switch`}>
            {t('views.welcome.switch.title')}
          </h3>
          <p className="welcome-switch-lead">{t('views.welcome.switch.lead')}</p>
          <ul className="welcome-switch-list" role="list">
            {SWITCHERS.map((tool) => (
              <li key={tool.kind} className="welcome-switch-card">
                <div className="welcome-switch-head">
                  <span className="welcome-switch-name">{tool.name}</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onImport(tool.kind)}
                    aria-describedby={`${uid}-${tool.kind}-hint`}
                  >
                    <UploadIcon size={14} /> {t('views.welcome.switch.import', { name: tool.name })}
                  </button>
                </div>
                <p className="welcome-switch-hint" id={`${uid}-${tool.kind}-hint`}>
                  <span className="welcome-switch-where">{t('views.welcome.switch.where')} </span>
                  {t(tool.hintKey)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h3 className="welcome-section-label">{t('views.welcome.toolsTitle')}</h3>
      <ul className="welcome-grid" role="list">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <button
              type="button"
              className="welcome-tile"
              onClick={tile.disabled ? undefined : tile.onClick}
              aria-disabled={tile.disabled || undefined}
              aria-describedby={descId(tile.id)}
            >
              {tile.icon}
              <span className="t">{tile.title}</span>
              <span className="d" id={descId(tile.id)}>
                {tile.desc}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="welcome-foot">
        <FileIcon size={13} />
        <span>{t('views.welcome.foot')}</span>
        <span style={{ flex: 1 }} />
        <span>{t('views.welcome.version', { version })}</span>
      </div>
    </section>
  )
}
