/** Settings page, update banner and update dialog. */
export const settings = {
  'settings.title': 'Settings',
  'settings.subtitle': 'Preferences are stored locally on this machine.',
  'settings.sectionsLabel': 'Settings sections',

  'settings.tabs.general.label': 'General',
  'settings.tabs.general.intro': 'How Tiger looks and how long it waits for a server.',
  'settings.tabs.network.label': 'Network',
  'settings.tabs.network.intro':
    'Redirects, SSL checks, proxy and cookies: how requests leave your machine.',
  'settings.tabs.advanced.label': 'Advanced',
  'settings.tabs.advanced.intro':
    'Certificates for company networks and mutual TLS. Most people never need these.',
  'settings.tabs.mcp.label': 'AI assistants (MCP)',
  'settings.tabs.mcp.intro':
    'Let Claude, Cursor and other AI assistants list and run the requests of a collection.',
  'settings.tabs.privacy.label': 'Privacy',
  'settings.tabs.privacy.intro': 'What Tiger sends about its own usage. Never your requests.',
  'settings.tabs.about.label': 'About',
  'settings.tabs.about.intro': 'Version, updates and project information.',

  'settings.appearance.label': 'Appearance',
  'settings.appearance.desc': 'Light glass, dark glass, or follow the system.',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.system': 'System',

  'settings.language.label': 'Language',
  'settings.language.desc': 'The language of menus, buttons and messages. Switches right away.',
  'settings.language.system': 'System default',
  /** Shown while "System default" is selected: which language the OS gives. */
  'settings.language.systemCurrent': 'System default ({language})',

  'settings.timeout.label': 'Request timeout',
  'settings.timeout.desc': 'How long to wait before giving up, in milliseconds.',
  'settings.timeout.aria': 'Request timeout (ms)',
  'settings.fontSize.label': 'Editor font size',
  'settings.fontSize.desc': 'Size of the monospace text in editors and the response.',

  'settings.redirects.label': 'Follow redirects',
  'settings.redirects.desc': 'Automatically follow 3xx responses to their target.',
  'settings.ssl.label': 'Verify SSL certificates',
  'settings.ssl.desc': 'Turn off to allow self-signed certificates (development only).',
  'settings.proxy.label': 'Use a proxy',
  'settings.proxy.desc': 'Route all requests through an HTTP/HTTPS or SOCKS proxy.',
  'settings.proxy.url.label': 'Proxy URL',
  'settings.proxy.url.desc': 'e.g. http://127.0.0.1:8080 or socks5://127.0.0.1:1080',
  'settings.proxy.username.label': 'Proxy username',
  'settings.proxy.username.desc':
    'Sent when the proxy asks for authentication. Leave blank for none.',
  'settings.proxy.username.placeholder': 'username',
  'settings.proxy.password.label': 'Proxy password',
  'settings.proxy.password.desc': 'Stored locally on this machine, never synced.',
  'settings.proxy.password.placeholder': 'password',
  'settings.cookies.label': 'Persistent cookie jar',
  'settings.cookies.desc':
    'Store cookies between sends and sessions. Cookies are saved locally and replayed on subsequent requests to matching domains.',
  'settings.cookies.clear': 'Clear cookies',
  'settings.cookies.cleared': 'Cleared',
  'settings.cookies.announceCleared': 'Cookies cleared',

  'settings.certExceptions.label': 'Certificate exceptions',
  'settings.certExceptions.desc':
    'Hostnames (comma-separated) where invalid or internal certificates are accepted, for example intranet.acme.local. Safer than turning verification off globally.',
  'settings.certExceptions.placeholder': 'host1, host2',
  'settings.maxRedirects.label': 'Maximum redirects',
  'settings.maxRedirects.desc': 'Upper bound when following 3xx responses.',
  'settings.certSubject.label': 'Client certificate subject filter',
  'settings.certSubject.desc':
    'When a server requests a client certificate, pick the one whose subject contains this text',
  'settings.certSubject.placeholder': 'e.g. CN=alice',
  'settings.certificates.group': 'Certificates',
  'settings.files.notSet': 'Not set',
  'settings.files.choose': 'Choose file',
  'settings.files.chooseAria': 'Choose file: {label}',
  'settings.files.clear': 'Clear',
  'settings.files.clearAria': 'Clear {label}',
  'settings.files.ca.label': 'CA bundle (PEM)',
  'settings.files.ca.desc': "Extra certificate authorities to trust, e.g. your company's internal CA.",
  'settings.files.ca.filter': 'PEM Certificate',
  'settings.files.clientCert.label': 'Client certificate (PEM)',
  'settings.files.clientCert.desc':
    'Your certificate, for servers that ask who you are (mutual TLS).',
  'settings.files.clientKey.label': 'Client key (PEM)',
  'settings.files.clientKey.desc': 'The private key that goes with the client certificate.',
  'settings.files.clientKey.filter': 'PEM Key',
  'settings.files.pfx.label': 'PFX / P12 bundle',
  'settings.files.pfx.desc': 'Certificate and key in one file, instead of the two PEM files.',
  'settings.files.pfx.filter': 'PFX / P12 Bundle',
  'settings.passphrase.label': 'Certificate passphrase',
  'settings.passphrase.desc': 'Unlocks the key or bundle above, if it has a password.',
  'settings.passphrase.placeholder': 'passphrase',
  'settings.certHint': 'Requests using imported certificates bypass the proxy.',

  'settings.mcp.intro':
    'Tiger ships a built-in MCP server (Model Context Protocol) that exposes your collections to Claude Desktop and other MCP-compatible clients. Add the snippet below to your {file} to connect.',
  'settings.mcp.pathPlaceholder': '<path to your collection folder>',
  'settings.mcp.note':
    'Replace {placeholder} with the absolute path to the folder you opened in Tiger. You can have one entry per collection.',
  'settings.mcp.copySnippet': 'Copy snippet',
  'settings.mcp.snippetCopied': 'Snippet copied',
  'settings.mcp.loading': 'Loading…',

  'settings.analytics.label': 'Anonymous usage analytics',
  'settings.analytics.desc':
    'On by default. Sends anonymous, aggregate events only (never URLs, headers or bodies). Turn off anytime.',
  'settings.analytics.aria': 'Analytics',

  'settings.autoUpdate.label': 'Install updates automatically',
  'settings.autoUpdate.desc':
    'Downloads new versions in the background and installs them when you restart or quit Tiger. When off, Tiger asks before downloading. Microsoft Store and Linux .deb installs update through their own store or package manager.',
  'settings.about.tagline': 'A local-first API client for teams.',
  'settings.about.version': 'Version {version}',

  'settings.update.title': 'Software update',
  'settings.update.later': 'Later',
  'settings.update.download': 'Download',
  'settings.update.restartNow': 'Restart now',
  'settings.update.releaseNotes': 'Release notes',
  'settings.update.releaseNotesFor': 'Release notes for {version}',
  'settings.update.hide': 'Hide',
  'settings.update.hideProgress': 'Hide update progress',
  'settings.update.manualTitle': 'Update available · v{version}',
  'settings.update.manualDesc': 'You are on v{current}. Version {latest} is ready to download.',
  'settings.update.downloadUpdate': 'Download update',
  'settings.update.whatChanged': 'What changed',
  'settings.update.downloadFromWebsite': 'Download from website',
  'settings.update.continueInBackground': 'Continue in background',
  'settings.update.downloadingAria': 'Downloading update {version}',
  'settings.update.laterHint': 'Choose Later to install it the next time you quit Tiger.',
  'settings.update.upToDateVersion': 'Tiger {version} is the latest version.',
  'settings.update.status.checking': 'Checking for updates…',
  'settings.update.status.upToDate': "You're on the latest version.",
  'settings.update.status.available': 'Tiger {version} is available.',
  'settings.update.status.downloading': 'Downloading update {version}… {percent}%',
  'settings.update.status.downloaded': 'Tiger {version} is ready. Restart to update.',
  'settings.update.announceDownloading': 'Downloading Tiger {version} in the background.',
  'settings.update.error.offline':
    "Couldn't reach the update server. Check your connection and try again.",
  'settings.update.error.notPublished': 'No update is published for this platform yet.',
  'settings.update.error.verification':
    'The downloaded update failed verification and was not installed.',
  'settings.update.error.failedDetail': 'Update failed: {detail}',
  'settings.update.error.failed': 'Update failed.'
} as const
