import type { TigerEnvironment, TigerRequest } from '@core/types'

/**
 * A small in-memory collection so the window is alive on first launch, before
 * the user opens a folder. These point at a public test API.
 */
export interface OpenRequest {
  id: string
  folder: string
  request: TigerRequest
  path?: string
  dirty?: boolean
}

export const sampleEnvironment: TigerEnvironment = {
  name: 'Demo',
  variables: [
    { name: 'baseUrl', value: 'https://jsonplaceholder.typicode.com', enabled: true },
    { name: 'userId', value: '1', enabled: true }
  ]
}

export const sampleRequests: OpenRequest[] = [
  {
    id: 'list-posts',
    folder: 'Posts',
    request: {
      name: 'List posts',
      seq: 1,
      method: 'get',
      url: '{{baseUrl}}/posts',
      query: [{ name: 'userId', value: '{{userId}}', enabled: true }],
      headers: [{ name: 'Accept', value: 'application/json', enabled: true }],
      body: { type: 'none', content: '' }
    }
  },
  {
    id: 'get-post',
    folder: 'Posts',
    request: {
      name: 'Get post',
      seq: 2,
      method: 'get',
      url: '{{baseUrl}}/posts/1',
      query: [],
      headers: [{ name: 'Accept', value: 'application/json', enabled: true }],
      body: { type: 'none', content: '' }
    }
  },
  {
    id: 'create-post',
    folder: 'Posts',
    request: {
      name: 'Create post',
      seq: 3,
      method: 'post',
      url: '{{baseUrl}}/posts',
      query: [],
      headers: [{ name: 'Content-Type', value: 'application/json', enabled: true }],
      body: {
        type: 'json',
        content: '{\n  "title": "Tiger",\n  "body": "Roar",\n  "userId": {{userId}}\n}'
      }
    }
  },
  {
    id: 'list-users',
    folder: 'Users',
    request: {
      name: 'List users',
      seq: 1,
      method: 'get',
      url: '{{baseUrl}}/users',
      query: [],
      headers: [{ name: 'Accept', value: 'application/json', enabled: true }],
      body: { type: 'none', content: '' }
    }
  }
]
