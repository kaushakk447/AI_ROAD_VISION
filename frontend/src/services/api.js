import axios from 'axios'

const configuredApiUrl = import.meta.env.VITE_API_URL
const trimmedApiUrl = configuredApiUrl?.replace(/\/+$/, '')
const baseURL = trimmedApiUrl
  ? (trimmedApiUrl === '/api' || trimmedApiUrl.endsWith('/api') ? trimmedApiUrl : `${trimmedApiUrl}/api`)
  : '/api'
export const AUTH_TOKEN_KEY = 'roadvision_access_token'

export const api = axios.create({ baseURL, timeout: 120000 })

api.interceptors.request.use((config) => {
  const token = window.sessionStorage.getItem(AUTH_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use((response) => response, (error) => {
  const requestUrl = error.config?.url || ''
  if (error.response?.status === 401 && !/\/auth\/(login|status)(?:\?|$)/.test(requestUrl)) {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY)
    window.dispatchEvent(new Event('roadvision-auth-expired'))
  }
  return Promise.reject(error)
})

export function apiError(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.detail || error?.message || fallback
}

export function absoluteApiUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const origin = baseURL.startsWith('/') ? window.location.origin : new URL(baseURL).origin
  return `${origin}${path}`
}

export async function downloadApiFile(path, filename) {
  const { data, headers } = await api.get(absoluteApiUrl(path), { responseType: 'blob' })
  const disposition = headers['content-disposition'] || ''
  const serverFilename = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1]
  const downloadName = filename || (serverFilename ? decodeURIComponent(serverFilename.replaceAll('"', '')) : 'roadvision-result')
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
