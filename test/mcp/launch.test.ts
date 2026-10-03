import { describe, expect, it } from 'vitest'
import { mcpClientConfig, resolveMcpLaunch, type McpLaunchInput } from '../../src/mcp/launch'

const mac: McpLaunchInput = {
  platform: 'darwin',
  env: {},
  execPath: '/Applications/Tiger.app/Contents/MacOS/Tiger',
  bundledServer: '/Applications/Tiger.app/Contents/Resources/app.asar.unpacked/out/mcp/server.mjs',
  copiedServer: '/Users/ada/Library/Application Support/Tiger/mcp/server.mjs'
}

const windows: McpLaunchInput = {
  platform: 'win32',
  env: {},
  execPath: 'C:\\Users\\ada\\AppData\\Local\\Programs\\Tiger\\Tiger.exe',
  bundledServer: 'C:\\Users\\ada\\AppData\\Local\\Programs\\Tiger\\resources\\app.asar.unpacked\\out\\mcp\\server.mjs',
  copiedServer: 'C:\\Users\\ada\\AppData\\Roaming\\Tiger\\mcp\\server.mjs'
}

const AS_NODE = { ELECTRON_RUN_AS_NODE: '1' }

describe('resolveMcpLaunch', () => {
  it('runs the bundled server with Tiger’s own executable as Node, so no Node install is needed', () => {
    expect(resolveMcpLaunch(mac)).toEqual({
      command: mac.execPath,
      serverPath: mac.bundledServer,
      env: AS_NODE,
      copy: false
    })
    // The Windows installer and zip: Tiger.exe, which most machines have instead of node.
    expect(resolveMcpLaunch(windows)).toEqual({
      command: windows.execPath,
      serverPath: windows.bundledServer,
      env: AS_NODE,
      copy: false
    })
    // A Linux .deb or tar.gz.
    const deb = { ...mac, platform: 'linux', execPath: '/opt/Tiger/tiger', bundledServer: '/opt/Tiger/resources/app.asar.unpacked/out/mcp/server.mjs' }
    expect(resolveMcpLaunch(deb)).toMatchObject({ command: '/opt/Tiger/tiger', serverPath: deb.bundledServer, env: AS_NODE })
  })

  it('runs an AppImage through the image file and a copy of the server, not the temporary mount', () => {
    const appImage: McpLaunchInput = {
      platform: 'linux',
      env: { APPIMAGE: '/home/ada/Apps/Tiger-0.8.0-linux-x64.AppImage', APPDIR: '/tmp/.mount_TigerAb12' },
      execPath: '/tmp/.mount_TigerAb12/tiger',
      bundledServer: '/tmp/.mount_TigerAb12/resources/app.asar.unpacked/out/mcp/server.mjs',
      copiedServer: '/home/ada/.config/Tiger/mcp/server.mjs'
    }
    expect(resolveMcpLaunch(appImage)).toEqual({
      command: '/home/ada/Apps/Tiger-0.8.0-linux-x64.AppImage',
      serverPath: '/home/ada/.config/Tiger/mcp/server.mjs',
      env: AS_NODE,
      copy: true
    })
  })

  it('runs a copy of the server with Node for the portable exe, whose folder is deleted on quit', () => {
    const portable: McpLaunchInput = {
      ...windows,
      env: { PORTABLE_EXECUTABLE_FILE: 'D:\\Tools\\Tiger-Portable-0.8.0-windows-x64.exe' },
      execPath: 'C:\\Users\\ada\\AppData\\Local\\Temp\\nsq2.tmp\\app\\Tiger.exe',
      bundledServer: 'C:\\Users\\ada\\AppData\\Local\\Temp\\nsq2.tmp\\app\\resources\\app.asar.unpacked\\out\\mcp\\server.mjs'
    }
    expect(resolveMcpLaunch(portable)).toEqual({
      command: 'node',
      serverPath: windows.copiedServer,
      env: {},
      copy: true,
      note: 'node'
    })
  })

  it('keeps a Microsoft Store install’s executable and server together, and says updates move them', () => {
    const store: McpLaunchInput = {
      ...windows,
      windowsStore: true,
      execPath: 'C:\\Program Files\\WindowsApps\\Tiger_0.8.0.0_x64__abc123\\app\\Tiger.exe',
      bundledServer:
        'C:\\Program Files\\WindowsApps\\Tiger_0.8.0.0_x64__abc123\\app\\resources\\app.asar.unpacked\\out\\mcp\\server.mjs'
    }
    expect(resolveMcpLaunch(store)).toEqual({
      command: store.execPath,
      serverPath: store.bundledServer,
      env: AS_NODE,
      copy: false,
      note: 'store'
    })
  })
})

describe('mcpClientConfig', () => {
  it('writes the mcpServers entry with the command, the server and collection arguments, and the env', () => {
    const launch = resolveMcpLaunch(mac)
    expect(JSON.parse(mcpClientConfig(launch, '<collection>'))).toEqual({
      mcpServers: {
        tiger: {
          command: '/Applications/Tiger.app/Contents/MacOS/Tiger',
          args: ['/Applications/Tiger.app/Contents/Resources/app.asar.unpacked/out/mcp/server.mjs', '<collection>'],
          env: { ELECTRON_RUN_AS_NODE: '1' }
        }
      }
    })
  })

  it('leaves env out when the command is Node itself', () => {
    const config = JSON.parse(mcpClientConfig({ command: 'node', serverPath: '/s.mjs', env: {} }, '/c'))
    expect(config.mcpServers.tiger).toEqual({ command: 'node', args: ['/s.mjs', '/c'] })
  })
})
