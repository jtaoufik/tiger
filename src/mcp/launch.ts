/**
 * How an AI client starts the MCP server of an installed Tiger: the snippet in
 * Settings > AI assistants. Pure (no Electron import) so every kind of install
 * is unit-tested; the tiger:mcpInfo handler in src/main/index.ts feeds it the
 * real process facts.
 *
 * The client runs Tiger's own executable as Node (ELECTRON_RUN_AS_NODE=1) on
 * the bundled server (one self-contained file, see server.ts), so nobody needs
 * Node installed: most Windows machines have none.
 */

export interface McpLaunchInput {
  platform: string
  /** process.windowsStore: true inside an MSIX (Microsoft Store) install. */
  windowsStore?: boolean
  env: Record<string, string | undefined>
  /** process.execPath: Tiger's executable (Electron's, in development). */
  execPath: string
  /** The server as installed: app.asar.unpacked/out/mcp/server.mjs (out/mcp in development). */
  bundledServer: string
  /** Where a copy of the server lives when the install moves: under userData. */
  copiedServer: string
}

/** What the snippet tells the AI client to run. */
export interface McpInfo {
  /** The program the client starts. */
  command: string
  /** The server file, passed as the program's first argument. */
  serverPath: string
  /** Environment the client sets for the program (empty when it is Node itself). */
  env: Record<string, string>
  /** A caveat shown under the snippet: Store updates move Tiger, or Node is needed. */
  note?: 'store' | 'node'
}

export interface McpLaunch extends McpInfo {
  /** The bundled server must be copied to `serverPath` before the snippet is used. */
  copy: boolean
}

const AS_NODE = { ELECTRON_RUN_AS_NODE: '1' }

export function resolveMcpLaunch(input: McpLaunchInput): McpLaunch {
  const { execPath, bundledServer, copiedServer, env } = input
  if (input.platform === 'linux' && env.APPIMAGE) {
    // An AppImage runs from a temporary mount (/tmp/.mount_*) that is gone
    // once Tiger quits. The image file itself ($APPIMAGE) stays, and runs its
    // program with the arguments and environment it is given.
    return { command: env.APPIMAGE, serverPath: copiedServer, env: AS_NODE, copy: true }
  }
  if (input.platform === 'win32' && env.PORTABLE_EXECUTABLE_FILE) {
    // The portable exe unpacks Tiger to a temporary folder it deletes on quit,
    // and its launcher does not pass stdin and stdout through to Tiger.
    return { command: 'node', serverPath: copiedServer, env: {}, copy: true, note: 'node' }
  }
  if (input.platform === 'win32' && input.windowsStore) {
    // The Store installs each version in its own folder (WindowsApps\<package
    // name>_<version>_...), executable included, and removes the old one after
    // an update. A copy of the server elsewhere would not outlive the
    // executable, and a copy under AppData is redirected into the package's
    // private storage, which programs started outside the package do not see.
    return { command: execPath, serverPath: bundledServer, env: AS_NODE, copy: false, note: 'store' }
  }
  return { command: execPath, serverPath: bundledServer, env: AS_NODE, copy: false }
}

/** The `mcpServers` entry for an AI client's config file (Claude Desktop and others). */
export function mcpClientConfig(info: McpInfo, collectionPath: string): string {
  const server = {
    command: info.command,
    args: [info.serverPath, collectionPath],
    ...(Object.keys(info.env).length ? { env: info.env } : {})
  }
  return JSON.stringify({ mcpServers: { tiger: server } }, null, 2)
}
