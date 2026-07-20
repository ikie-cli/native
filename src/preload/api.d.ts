import type { NativeApi } from './index'

declare global {
  interface Window {
    native: NativeApi
  }
}

export {}
