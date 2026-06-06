/**
 * Tiger MCP server. Exposes a collection over the Model Context Protocol so an
 * AI client (Claude Desktop, Claude Code, …) can list, read and run requests.
 *
 *   tiger-mcp /path/to/collection
 *   TIGER_COLLECTION=/path/to/collection tiger-mcp
 *
 * Register in Claude Desktop's config:
 *   { "mcpServers": { "tiger": { "command": "tiger-mcp", "args": ["/path/to/collection"] } } }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createFsStore, createNodeRunner } from './store'
import {
  handleGetRequest,
  handleListEnvironments,
  handleListRequests,
  handleRunRequest
} from './handlers'

const root = process.env.TIGER_COLLECTION || process.argv[2] || process.cwd()
const store = createFsStore(root)
const runner = createNodeRunner()

const server = new McpServer({ name: 'tiger', version: '0.1.0' })

server.registerTool(
  'list_requests',
  {
    title: 'List requests',
    description: 'List every request in the Tiger collection, with its relative path.',
    inputSchema: {}
  },
  async () => handleListRequests(store)
)

server.registerTool(
  'list_environments',
  {
    title: 'List environments',
    description: 'List the environments available in the collection.',
    inputSchema: {}
  },
  async () => handleListEnvironments(store)
)

server.registerTool(
  'get_request',
  {
    title: 'Get request',
    description: 'Return a single parsed request as JSON.',
    inputSchema: { path: z.string().describe('Relative path to the .tiger file') }
  },
  async ({ path }) => handleGetRequest(store, path)
)

server.registerTool(
  'run_request',
  {
    title: 'Run request',
    description: 'Execute a request (optionally with an environment) and return the response.',
    inputSchema: {
      path: z.string().describe('Relative path to the .tiger file'),
      environment: z.string().optional().describe('Environment name to resolve {{variables}}'),
      timeoutMs: z.number().optional().describe('Request timeout in milliseconds')
    }
  },
  async (args) => handleRunRequest(store, runner, args)
)

await server.connect(new StdioServerTransport())
