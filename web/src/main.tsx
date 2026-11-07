import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './shared/ui/Toast'
import { ApiError } from './shared/api/client'
import { registerServiceWorker } from './shared/pwa'
import { USE_MOCK_API } from './config'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
    mutations: { networkMode: 'offlineFirst' },
  },
})

if (USE_MOCK_API && import.meta.env.DEV) {
  // Test hook: lets Playwright reset the mock database between runs.
  ;(window as unknown as { __gumsum: object }).__gumsum = {
    resetMock: async () => (await import('./mock/db')).resetDb(),
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* reducedMotion="user": slides and scales collapse to fades under prefers-reduced-motion (DESIGN §3.3) */}
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

registerServiceWorker()
