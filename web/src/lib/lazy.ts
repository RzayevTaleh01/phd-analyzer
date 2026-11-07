import { lazy, type ComponentType } from 'react'

/**
 * lazy() that survives a rebuild: a tab opened before `npm start` rebuilt the app asks for chunk names
 * that no longer exist, so reload once to pick up the new ones instead of showing a blank page.
 */
export function lazyPage<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      (m) => {
        sessionStorage.removeItem('chunk-reload')
        return m
      },
      (err) => {
        if (!sessionStorage.getItem('chunk-reload')) {
          sessionStorage.setItem('chunk-reload', '1')
          window.location.reload()
          return new Promise<never>(() => {})
        }
        throw err
      },
    ),
  )
}
