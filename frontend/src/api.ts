import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let csrfToken: string | null = null
let csrfRequest: Promise<string> | null = null

api.interceptors.request.use(async (config) => {
  if (['post', 'put', 'patch', 'delete'].includes((config.method || 'get').toLowerCase())) {
    if (!csrfToken) {
      csrfRequest ??= api.get('/auth/csrf').then(({ data }) => data.csrfToken as string).finally(() => { csrfRequest = null })
      csrfToken = await csrfRequest
    }
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    if (response.config.url === '/auth/logout') csrfToken = null
    return response
  },
  (error) => {
    if (error.response?.status === 403 && error.response?.data?.message?.includes('Request verification failed') && !error.config?._csrfRetry) {
      csrfToken = null
      error.config._csrfRetry = true
      return api.request(error.config)
    }
    if (error.config?.url === '/auth/logout') csrfToken = null
    if (error.response?.status === 401 && !['/auth/login', '/auth/register'].includes(error.config?.url ?? '')) {
      localStorage.removeItem('ledger_user')
      window.dispatchEvent(new Event('ledger:unauthorized'))
    }
    if (error.response?.data?.code === 'ACCOUNT_SUSPENDED') {
      localStorage.removeItem('ledger_user')
      window.dispatchEvent(new Event('ledger:unauthorized'))
    }
    return Promise.reject(error)
  },
)

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) return error.response?.data?.message || error.message || 'Something went wrong. Please try again.'
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
