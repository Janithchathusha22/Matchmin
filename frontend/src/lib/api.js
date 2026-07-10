import { getStaticFallback, predictStaticFallback } from './fallback'

// In production set VITE_API_URL to the deployed backend origin
// (e.g. https://matchmind-api.onrender.com). Empty locally so Vite's
// dev proxy handles /api -> http://localhost:8000.
const API_BASE = import.meta.env.VITE_API_URL || ''
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 5500)

const cache = new Map()

async function fetchApi(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(API_BASE + path, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function get(path) {
  if (cache.has(path)) return cache.get(path)
  let data
  try {
    const res = await fetchApi(path)
    if (!res.ok) throw new Error(`${path} -> ${res.status}`)
    data = await res.json()
  } catch (error) {
    console.warn(`Using static fallback for ${path}`, error)
    data = await getStaticFallback(path)
  }
  cache.set(path, data)
  return data
}

export const api = {
  health: () => get('/api/health'),
  teams: () => get('/api/teams'),
  contenders: () => get('/api/contenders'),
  team: (name) => get(`/api/teams/${encodeURIComponent(name)}`),
  simulate: () => get('/api/simulate'),
  bracket: () => get('/api/bracket'),
  network: () => get('/api/network'),
  metrics: () => get('/api/model/metrics'),
  accuracy: () => get('/api/accuracy'),
  predict: async (home, away, knockout) => {
    try {
      const res = await fetchApi('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home, away, knockout }),
      })
      if (!res.ok) {
        let detail = 'prediction failed'
        try { detail = (await res.json()).detail || detail } catch { detail = `${res.status}` }
        throw new Error(detail)
      }
      return res.json()
    } catch (error) {
      console.warn('Using static prediction fallback', error)
      return predictStaticFallback(home, away, knockout)
    }
  },
}

export const CONFED_COLORS = {
  UEFA: 'var(--c-uefa)',
  CONMEBOL: 'var(--c-conmebol)',
  CONCACAF: 'var(--c-concacaf)',
  CAF: 'var(--c-caf)',
  AFC: 'var(--c-afc)',
  OFC: 'var(--c-ofc)',
}

const FLAG_ISO = {
  Mexico: 'mx', 'South Africa': 'za', 'South Korea': 'kr', Czechia: 'cz',
  Canada: 'ca', 'Bosnia and Herzegovina': 'ba', Qatar: 'qa', Switzerland: 'ch',
  Brazil: 'br', Morocco: 'ma', Haiti: 'ht', Scotland: 'gb-sct', USA: 'us',
  Paraguay: 'py', Australia: 'au', 'Türkiye': 'tr', Germany: 'de',
  'Curaçao': 'cw', "Côte d'Ivoire": 'ci', Ecuador: 'ec', Netherlands: 'nl',
  Japan: 'jp', Sweden: 'se', Tunisia: 'tn', Belgium: 'be', Egypt: 'eg',
  'IR Iran': 'ir', 'New Zealand': 'nz', Spain: 'es', 'Cabo Verde': 'cv',
  'Saudi Arabia': 'sa', Uruguay: 'uy', France: 'fr', Senegal: 'sn', Iraq: 'iq',
  Norway: 'no', Argentina: 'ar', Algeria: 'dz', Austria: 'at', Jordan: 'jo',
  Portugal: 'pt', 'Congo DR': 'cd', Uzbekistan: 'uz', Colombia: 'co',
  England: 'gb-eng', Croatia: 'hr', Ghana: 'gh', Panama: 'pa',
}

export const flagUrl = (team, size = 40) =>
  FLAG_ISO[team] ? `https://flagcdn.com/w${size}/${FLAG_ISO[team]}.png` : null

export const pct = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`
