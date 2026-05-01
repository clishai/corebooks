export {}

declare global {
  interface Window {
    electronAPI?: {
      apiBaseUrl: string
    }
  }
}
