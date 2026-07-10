import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { flagUrl, pct } from '../lib/api'

export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }))
    return () => { alive = false }
  }, deps)
  return state
}

export const FadeUp = ({ children, delay = 0, className = '' }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 0.55, delay, ease: [0.2, 0.8, 0.2, 1] }}
  >
    {children}
  </motion.div>
)

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
    <div className="size-5 animate-spin rounded-full border-2 border-slate-600 border-t-accent" />
    {label}
  </div>
)

export const ErrorBox = ({ error }) => (
  <div className="glass mx-auto my-12 max-w-lg border-red-400/30 p-6 text-center text-red-300">
    <p className="font-semibold">Backend unreachable</p>
    <p className="mt-1 text-sm text-red-300/70">{String(error)}</p>
    <p className="mt-3 text-xs text-slate-400">
      Start it with: <code className="rounded bg-black/40 px-1.5 py-0.5">uv run uvicorn matchmind.api:app --port 8000</code>
    </p>
  </div>
)

export function Flag({ team, size = 40, className = 'h-5 w-7' }) {
  const url = flagUrl(team, size)
  if (!url) return <span className="text-xs font-bold text-slate-400">{team?.slice(0, 3).toUpperCase()}</span>
  return <img src={url} alt="" loading="lazy" className={`${className} rounded-[3px] object-cover ring-1 ring-white/20`} />
}

export const SectionTitle = ({ kicker, title, right }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
    <div>
      {kicker && <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">{kicker}</p>}
      <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
    </div>
    {right}
  </div>
)

export function StatTile({ label, value, sub, glow = 'accent' }) {
  return (
    <div className="glass glass-hover p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={`tabular mt-2 text-3xl font-extrabold text-white ${glow === 'gold' ? 'text-glow-gold' : 'text-glow-accent'}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

/** Three-way outcome probability bar (home / draw / away). */
export function ProbBar({ home, draw, away, homeName = 'Home', awayName = 'Away', compact = false }) {
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-black/40">
        <div className="probbar-fill rounded-l-full bg-home" style={{ width: pct(home, 1) }} title={`${homeName} win ${pct(home)}`} />
        <div className="probbar-fill bg-drawc" style={{ width: pct(draw, 1) }} title={`Draw ${pct(draw)}`} />
        <div className="probbar-fill rounded-r-full bg-away" style={{ width: pct(away, 1) }} title={`${awayName} win ${pct(away)}`} />
      </div>
      {!compact && (
        <div className="tabular mt-1.5 flex justify-between text-xs">
          <span className="font-semibold text-[#7db4f2]">{homeName} {pct(home)}</span>
          <span className="text-slate-400">draw {pct(draw)}</span>
          <span className="font-semibold text-[#f0a1a1]">{awayName} {pct(away)}</span>
        </div>
      )}
    </div>
  )
}

export const ResultChip = ({ r }) => {
  const styles = {
    W: 'bg-accent/15 text-accent border-accent/30',
    D: 'bg-slate-500/15 text-slate-300 border-slate-400/30',
    L: 'bg-red-400/10 text-red-300 border-red-400/30',
  }
  return (
    <span className={`inline-flex size-6 items-center justify-center rounded-md border text-[11px] font-bold ${styles[r]}`}>
      {r}
    </span>
  )
}
