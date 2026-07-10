import { api, pct } from '../lib/api'
import { ErrorBox, FadeUp, Flag, SectionTitle, Spinner, useFetch } from '../components/ui.jsx'

const STAGE_COLUMNS = [
  ['Round of 16', [89, 90, 91, 92, 93, 94, 95, 96]],
  ['Quarter-finals', [97, 98, 99, 100]],
  ['Semi-finals', [101, 102]],
  ['Final', [104, 103]],
]

function TeamRow({ name, score, pens, winner, prob }) {
  const isWinner = winner && winner === name
  const eliminated = winner && winner !== name && name
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${eliminated ? 'opacity-45' : ''}`}>
      {name ? <Flag team={name} className="h-4 w-6" /> : <span className="inline-block h-4 w-6 rounded-[3px] bg-white/10" />}
      <span className={`flex-1 truncate text-sm ${isWinner ? 'font-bold text-accent' : 'font-medium text-slate-200'}`}>
        {name ?? 'TBD'}
      </span>
      {prob != null && <span className="tabular text-[11px] font-semibold text-slate-400">{pct(prob)}</span>}
      {score != null && (
        <span className={`tabular text-sm font-bold ${isWinner ? 'text-accent' : 'text-slate-300'}`}>
          {score}{pens != null && <sup className="text-[9px] text-slate-400"> ({pens})</sup>}
        </span>
      )}
    </div>
  )
}

function MatchBox({ slot, prediction }) {
  const probHome = prediction?.advance_prob_home
  return (
    <div className={`glass glass-hover overflow-hidden ${slot.stage === 'Final' ? 'border-gold/40 shadow-[0_0_28px_rgba(255,193,7,0.12)]' : ''}`}>
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <span>{slot.stage === 'Third-place match' ? '3rd place' : `M${slot.match_id}`}</span>
        <span>{slot.date}</span>
      </div>
      <TeamRow name={slot.home} score={slot.home_score} pens={slot.home_pens} winner={slot.winner}
        prob={slot.winner ? null : probHome} />
      <div className="mx-3 border-t border-white/5" />
      <TeamRow name={slot.away} score={slot.away_score} pens={slot.away_pens} winner={slot.winner}
        prob={slot.winner ? null : probHome != null ? 1 - probHome : null} />
      {!slot.winner && prediction && (
        <div className="border-t border-white/5 bg-accent/5 px-3 py-1.5 text-[11px]">
          <span className="text-slate-400">AI pick: </span>
          <span className="font-bold text-accent">{prediction.pick}</span>
          <span className="tabular text-slate-500"> · likely {prediction.top_scorelines[0].home_goals}–{prediction.top_scorelines[0].away_goals}</span>
        </div>
      )}
    </div>
  )
}

export default function Bracket() {
  const { data, error, loading } = useFetch(api.bracket)
  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />

  const slots = Object.fromEntries(data.slots.map((s) => [s.match_id, s]))
  const preds = Object.fromEntries(data.predictions.map((p) => [p.match_id, p]))

  return (
    <div>
      <SectionTitle kicker="Road to the final" title="WC2026 knockout bracket"
        right={<span className={`text-xs font-semibold ${data.artifacts_fresh ? 'text-accent' : 'text-gold'}`}>
          {data.artifacts_fresh ? '● verified model state' : 'refresh required'} · as of {data.as_of} · advance % includes ET + penalties
        </span>} />
      <div className="grid gap-6 lg:grid-cols-4">
        {STAGE_COLUMNS.map(([stage, ids], col) => (
          <FadeUp key={stage} delay={col * 0.07}>
            <div>
              <h3 className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                {stage === 'Final' ? 'Final · 3rd place' : stage}
              </h3>
              <div className={`flex flex-col gap-4 ${col === 1 ? 'lg:justify-around lg:py-8' : ''} ${col >= 2 ? 'lg:justify-center lg:gap-10 lg:py-16' : ''} lg:h-full`}>
                {ids.map((id) => slots[id] && <MatchBox key={id} slot={slots[id]} prediction={preds[id]} />)}
              </div>
            </div>
          </FadeUp>
        ))}
      </div>
    </div>
  )
}
