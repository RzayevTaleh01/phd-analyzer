import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import '@xyflow/react/dist/style.css'
import './styles.css'
import App from './App'
import AuthGate from './AuthGate'
import Docs from './Docs'
import { StoreProvider } from './store'

// The user guide is public (no password), so it can be linked from the repository.
const isDocs = window.location.pathname.replace(/\/+$/, '') === '/docs'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDocs ? (
      <Docs />
    ) : (
      <AuthGate>
        <StoreProvider>
          <App />
        </StoreProvider>
      </AuthGate>
    )}
  </StrictMode>,
)
