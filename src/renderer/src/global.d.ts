import type { TigerApi } from '../../preload'

declare global {
  interface Window {
    tiger?: TigerApi
  }
}

export {}
