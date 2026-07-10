import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, CONFED_COLORS, pct } from '../lib/api'
import { ErrorBox, FadeUp, Flag, ResultChip, SectionTitle, Spinner, useFetch } from '../components/ui.jsx'

function TeamDetail({ name, onClose }) {
  const { data, error, loading } = useFetch(() => api.team(name), [name])
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="glass max-h-[85vh] w-full max-w-xl overflow-y-auto p-6"
        style={{ background: 'rgba(13,18,30,0.92)' }}
        onClick={(e) => e.stopPropagation()}>
        {loading && <Spinner />}
        {error && <ErrorBox error={error} />}
        {data && (
          <>
            {data.image && (
              <div className="relative -mx-6 -mt-6 mb-5 h-44 overflow-hidden rounded-t-[1.1rem]">
                <img src={data.image} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(13,18,30,.98)] to-transparent" />
              </div>
            )}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Flag team={data.name} className="h-9 w-13" size={80} />
                <div>
                  <h3 className="text-2xl font-extrabold text-white">{data.name}</h3>
                  <p className="text-xs text-slate-400">
                    Group {data.group} · {data.confederation} · Manager {data.manager}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white">✕</button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[['Elo rating', data.elo], ['FIFA rank', `#${data.fifa_rank}`],
                ['Title odds', data.odds ? pct(data.odds.champion, 1) : '—']].map(([l, v]) => (
                <div key={l} className="glass-inset p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{l}</p>
                  <p className="tabular mt-1 text-lg font-extrabold text-white">{v}</p>
                </div>
              ))}
            </div>

            {data.odds && (
              <div className="mt-4 space-y-2">
                {[['Reach semi-finals', data.odds.reach_sf], ['Reach final', data.odds.reach_final],
                  ['Win the World Cup', data.odds.champion]].map(([l, v]) => (
                  <div key={l}>
                    <div className="flex justify-between text-xs text-slate-400"><span>{l}</span><span className="tabular font-semibold text-white">{pct(v, 1)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-black/40">
                      <div className="probbar-fill h-full rounded-full bg-gold" style={{ width: pct(v) }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h4 className="mt-6 mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Tournament so far</h4>
            <ul className="space-y-1.5">
              {data.matches.map((m) => (
                <li key={m.match_id} className="glass-inset flex items-center gap-3 px-3 py-2 text-sm">
                  <ResultChip r={m.result} />
                  <span className="flex-1 truncate text-slate-200">vs {m.opponent}</span>
                  <span className="text-[11px] text-slate-500">{m.stage}</span>
                  <span className="tabular font-bold text-white">{m.gf}–{m.ga}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

export default function Teams() {
  const { data, error, loading } = useFetch(api.teams)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />

  const filtered = data.filter((t) => t.alive && t.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div>
      <SectionTitle kicker="Seven live title paths" title="Contender explorer"
        right={
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teams…"
            className="glass px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-accent/40" />
        } />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((t, i) => (
          <FadeUp key={t.name} delay={Math.min(i * 0.02, 0.3)}>
            <button onClick={() => setSelected(t.name)} className="glass glass-hover group relative min-h-56 w-full overflow-hidden p-0 text-left">
              <img src={t.image} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080d16] via-[#080d16]/55 to-transparent" />
              <div className="absolute inset-0 flex flex-col justify-between p-4">
                <div className="flex items-center justify-between">
                  <Flag team={t.name} className="h-6 w-9" size={80} />
                  <span className="rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-bold backdrop-blur"
                    style={{ color: CONFED_COLORS[t.confederation] }}>{t.confederation}</span>
                </div>
                <div>
                  <p className="truncate text-lg font-black text-white">{t.name}</p>
                  <p className="text-[11px] text-slate-300">FIFA #{t.fifa_rank} · Elo {t.elo}</p>
                  <div className="tabular mt-2 flex items-end justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Title probability</span>
                    <span className="text-xl font-black text-gold">{pct(t.champion_prob, 1)}</span>
                  </div>
                </div>
              </div>
            </button>
          </FadeUp>
        ))}
      </div>
      <AnimatePresence>
        {selected && <TeamDetail name={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  )
}
