import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api, pct } from '../lib/api'
import { ErrorBox, FadeUp, Flag, ProbBar, SectionTitle, Spinner, useFetch } from '../components/ui.jsx'

const FEATURE_LABELS = {
  elo_home: 'Elo — home', elo_away: 'Elo — away', elo_diff: 'Elo difference',
  winrate5_home: 'Win rate L5 — home', winrate5_away: 'Win rate L5 — away',
  goals_for5_home: 'Goals for L5 — home', goals_for5_away: 'Goals for L5 — away',
  goals_against5_home: 'Goals against L5 — home', goals_against5_away: 'Goals against L5 — away',
  is_knockout: 'Knockout match',
}

const MODEL_LABELS = {
  baseline_elo_logreg: 'Elo logistic', random_forest: 'Random Forest',
  xgboost: 'XGBoost', neural_network: 'Neural Network',
  bayesian_poisson_proxy: 'Goal model',
}

function TeamSelect({ label, teams, value, onChange, exclude }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const filtered = useMemo(
    () => teams.filter((t) => t.name !== exclude && t.name.toLowerCase().includes(query.toLowerCase())),
    [teams, query, exclude],
  )
  return (
    <div className="relative flex-1">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="glass flex w-full items-center gap-2.5 px-4 py-3 text-left font-semibold text-white transition hover:border-accent/40">
        {value ? <><Flag team={value} /> {value}</> : <span className="text-slate-500">Select team…</span>}
        <span className="ml-auto text-slate-500">▾</span>
      </button>
      {open && (
        <div className="glass absolute z-30 mt-2 max-h-72 w-full overflow-y-auto p-2" style={{ background: 'rgba(13,18,30,0.95)' }}>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search 48 teams…"
            className="glass-inset mb-2 w-full px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500" />
          {filtered.map((t) => (
            <button key={t.name} type="button"
              onClick={() => { onChange(t.name); setOpen(false); setQuery('') }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-accent/10 hover:text-accent">
              <Flag team={t.name} /> {t.name}
              <span className="ml-auto text-[11px] text-slate-500">Group {t.group} · Elo {t.elo}</span>
            </button>
          ))}
          {!filtered.length && <p className="px-3 py-2 text-sm text-slate-500">No match.</p>}
        </div>
      )}
    </div>
  )
}

function ScorelineGrid({ scorelines, home, away }) {
  const max = scorelines[0].prob
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {scorelines.map((s, i) => (
        <motion.div key={`${s.home_goals}-${s.away_goals}`}
          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
          className="glass-inset relative overflow-hidden p-3 text-center"
          title={`${home} ${s.home_goals}–${s.away_goals} ${away}: ${pct(s.prob, 1)}`}>
          <div className="absolute inset-x-0 bottom-0 bg-home/25" style={{ height: `${(s.prob / max) * 100}%` }} />
          <p className="tabular relative text-xl font-extrabold text-white">{s.home_goals}–{s.away_goals}</p>
          <p className="tabular relative mt-0.5 text-[11px] font-semibold text-slate-400">{pct(s.prob, 1)}</p>
        </motion.div>
      ))}
    </div>
  )
}

function Explainability({ result }) {
  const contributions = result.explanation.contributions.slice(0, 7)
  const maxImpact = Math.max(...contributions.map((row) => Math.abs(row.contribution)), 0.001)
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-sm font-bold text-white">Exact Shapley drivers</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Change in {result.home}'s 90-minute win probability against the historical reference profile.
        </p>
        <div className="mt-4 space-y-3">
          {contributions.map((row) => {
            const positive = row.contribution >= 0
            return (
              <div key={row.feature}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-slate-300">{FEATURE_LABELS[row.feature] ?? row.feature}</span>
                  <span className={`tabular font-black ${positive ? 'text-accent' : 'text-red-300'}`}>
                    {positive ? '+' : ''}{(row.contribution * 100).toFixed(1)} pts
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/35">
                  <div className={`h-full rounded-full ${positive ? 'bg-accent' : 'bg-red-400'}`}
                    style={{ width: `${Math.max((Math.abs(row.contribution) / maxImpact) * 100, 3)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Independent model room</h3>
          <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${result.confidence === 'high' ? 'border-accent/30 bg-accent/10 text-accent' : result.confidence === 'low' ? 'border-red-400/30 bg-red-400/10 text-red-300' : 'border-gold/30 bg-gold/10 text-gold'}`}>
            {result.confidence} confidence
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Disagreement spread {pct(result.model_disagreement, 1)} · upset index {pct(result.upset_index, 1)}.
        </p>
        <div className="mt-4 space-y-2">
          {result.model_votes.map((vote) => (
            <div key={vote.model} className="rounded-xl border border-white/5 bg-black/15 px-3 py-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">{MODEL_LABELS[vote.model] ?? vote.model}</span>
                <span className="tabular font-black text-white">{pct(vote.home_advance, 1)} {result.home}</span>
              </div>
              <div className="mt-2 h-1 rounded-full bg-away/35"><div className="h-full rounded-full bg-home" style={{ width: pct(vote.home_advance, 1) }} /></div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          SHAP explains this model, not causality. A positive value supports {result.home}; a negative value supports {result.away}.
        </p>
      </div>
    </div>
  )
}

export default function Predict() {
  const teams = useFetch(api.teams)
  const [home, setHome] = useState('Spain')
  const [away, setAway] = useState('Belgium')
  const [knockout, setKnockout] = useState(true)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (teams.loading) return <Spinner />
  if (teams.error) return <ErrorBox error={teams.error} />

  const run = async () => {
    if (!home || !away) return
    setBusy(true); setError(null)
    try { setResult(await api.predict(home, away, knockout)) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-8">
      <SectionTitle kicker="Probability · disagreement · explanation" title="Explainable match lab" />

      <FadeUp>
        <div className="glass p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <TeamSelect label="Home side" teams={teams.data} value={home} onChange={setHome} exclude={away} />
            <span className="hidden pb-3 text-lg font-black text-slate-600 md:block">VS</span>
            <TeamSelect label="Away side" teams={teams.data} value={away} onChange={setAway} exclude={home} />
            <div className="flex items-center gap-4 md:pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={knockout} onChange={(e) => setKnockout(e.target.checked)}
                  className="size-4 accent-[#00e676]" />
                Knockout
              </label>
              <button onClick={run} disabled={busy || !home || !away}
                className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-[#04240f] shadow-[0_0_28px_rgba(0,230,118,0.3)] transition hover:brightness-110 disabled:opacity-40">
                {busy ? 'Crunching…' : 'Predict'}
              </button>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        </div>
      </FadeUp>

      {result && (
        <div className="space-y-6">
          <FadeUp>
            <div className="glass p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xl font-extrabold text-white"><Flag team={result.home} className="h-7 w-10" /> {result.home}</div>
                <div className="text-center">
                  <p className="tabular text-3xl font-black text-white">{result.expected_goals.home} · {result.expected_goals.away}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">expected goals</p>
                </div>
                <div className="flex items-center gap-3 text-xl font-extrabold text-white">{result.away} <Flag team={result.away} className="h-7 w-10" /></div>
              </div>
              <ProbBar home={result.probs.home} draw={result.probs.draw} away={result.probs.away}
                homeName={result.home} awayName={result.away} />
              {result.advance_prob_home != null && (
                <p className="tabular mt-4 text-center text-sm text-slate-300">
                  Knockout tie: <span className="font-bold text-accent">{result.home}</span> advances with{' '}
                  <span className="font-bold text-accent">{pct(result.advance_prob_home, 1)}</span> probability
                  (draws resolved by extra-time/penalty strength).
                </p>
              )}
            </div>
          </FadeUp>

          <FadeUp delay={0.05}>
            <div className="glass p-6">
              <SectionTitle kicker="Poisson scoreline engine" title="Most likely scorelines" />
              <ScorelineGrid scorelines={result.top_scorelines} home={result.home} away={result.away} />
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <div className="glass p-6">
              <SectionTitle kicker="Why · how stable · what could flip it" title="Explainable AI room" />
              <Explainability result={result} />
            </div>
          </FadeUp>
        </div>
      )}
    </div>
  )
}
