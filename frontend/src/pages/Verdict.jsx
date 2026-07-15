import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api, pct } from '../lib/api'
import { ErrorBox, FadeUp, Flag, SectionTitle, Spinner, useFetch } from '../components/ui.jsx'

/* ------------------------------------------------------------------ data --- */
/* External benchmarks — verified 2026-07-09/10, quarter-final stage.
   Opta: theanalyst.com QF projections · Market: US sportsbook outright odds
   (implied % = 100/(100+american); includes the bookmaker margin, so the
   column sums past 100% — shown raw on purpose and footnoted). */
const EXTERNAL = {
  opta: {
    France: 0.273, Spain: 0.173, Argentina: 0.173, England: 0.165,
    Norway: 0.066, Switzerland: 0.038, Belgium: null, // Opta's live bracket rated Morocco in this slot
  },
  market: {
    France: 0.357, Spain: 0.213, Argentina: 0.2, England: 0.175,
    Norway: 0.063, Belgium: 0.032, Switzerland: 0.032,
  },
  marketOdds: {
    France: '+180', Spain: '+370', Argentina: '+400', England: '+470',
    Norway: '+1500', Belgium: '+3000', Switzerland: '+3000',
  },
}

const KEY_FACTOR = {
  France: '🔥 Squad depth — and already through to the semi-final',
  Spain: '⚡ Euro 2024 champions · highest xG control in the field',
  Argentina: '🏆 Defending champions · Elo #1 · only perfect record left',
  England: '✨ Elite attacking talent under Tuchel',
  Norway: '🐎 The Haaland factor — one man can break any model',
  Belgium: '🐎 Golden Generation 2.0, unbeaten so far',
  Switzerland: '🧱 Defensive machine — 0.6 goals conceded per game',
}

/* Every World Cup title defence since the first one was possible (1938).
   20 attempts · 2 successful → the 10% base rate. */
const DEFENCES = [
  { year: 1938, champ: 'Italy', result: 'WON', note: 'Back-to-back — the first ever' },
  { year: 1950, champ: 'Italy', result: 'GROUP', note: 'Out in the first round' },
  { year: 1954, champ: 'Uruguay', result: 'SEMI', note: 'Fourth place' },
  { year: 1958, champ: 'West Germany', result: 'SEMI', note: 'Fourth place' },
  { year: 1962, champ: 'Brazil', result: 'WON', note: 'Back-to-back — the last time in history' },
  { year: 1966, champ: 'Brazil', result: 'GROUP', note: 'Kicked out of the group stage' },
  { year: 1970, champ: 'England', result: 'QF', note: 'Lost 3–2 to West Germany' },
  { year: 1974, champ: 'Brazil', result: 'SEMI', note: 'Fourth place' },
  { year: 1978, champ: 'West Germany', result: 'QF', note: 'Second group phase exit' },
  { year: 1982, champ: 'Argentina', result: 'QF', note: 'Second group phase exit' },
  { year: 1986, champ: 'Italy', result: 'R16', note: 'Beaten by Platini’s France' },
  { year: 1990, champ: 'Argentina', result: 'FINAL', note: 'Runners-up — closest since 1962' },
  { year: 1994, champ: 'Germany', result: 'QF', note: 'Shocked by Bulgaria' },
  { year: 1998, champ: 'Brazil', result: 'FINAL', note: 'Runners-up in Paris' },
  { year: 2002, champ: 'France', result: 'GROUP', note: 'Zero goals scored' },
  { year: 2006, champ: 'Brazil', result: 'QF', note: 'Zidane’s France again' },
  { year: 2010, champ: 'Italy', result: 'GROUP', note: 'Bottom of the group' },
  { year: 2014, champ: 'Spain', result: 'GROUP', note: '5–1 vs Netherlands, then out' },
  { year: 2018, champ: 'Germany', result: 'GROUP', note: 'First German group exit ever' },
  { year: 2022, champ: 'France', result: 'FINAL', note: 'Lost the final on penalties — to Argentina' },
]

const RESULT_STYLE = {
  WON: { chip: 'border-gold/50 bg-gold/15 text-gold', glyph: '🏆', label: 'DEFENDED' },
  FINAL: { chip: 'border-celeste/50 bg-celeste/15 text-celeste', glyph: '🥈', label: 'FINAL' },
  SEMI: { chip: 'border-white/15 bg-white/5 text-slate-300', glyph: '½', label: 'SEMIS' },
  QF: { chip: 'border-white/15 bg-white/5 text-slate-300', glyph: '¼', label: 'QF' },
  R16: { chip: 'border-white/15 bg-white/5 text-slate-300', glyph: '⅛', label: 'R16' },
  GROUP: { chip: 'border-red-400/30 bg-red-400/10 text-red-300', glyph: '✕', label: 'GROUP' },
}

/* World Cups hosted in the Americas — 7 of 8 won by South America. */
const AMERICAS = [
  { year: 1930, host: 'Uruguay', winner: 'Uruguay', conmebol: true },
  { year: 1950, host: 'Brazil', winner: 'Uruguay', conmebol: true },
  { year: 1962, host: 'Chile', winner: 'Brazil', conmebol: true },
  { year: 1970, host: 'Mexico', winner: 'Brazil', conmebol: true },
  { year: 1978, host: 'Argentina', winner: 'Argentina', conmebol: true },
  { year: 1986, host: 'Mexico', winner: 'Argentina', conmebol: true },
  { year: 1994, host: 'USA', winner: 'Brazil', conmebol: true },
  { year: 2014, host: 'Brazil', winner: 'Germany', conmebol: false },
]

const LENSES = [
  { id: 'matchmind', label: 'MatchMind · 200k sims', blurb: 'Our calibrated ensemble + Poisson engine, 200,000 bracket simulations.' },
  { id: 'opta', label: 'Opta · archived QF', blurb: 'Stats Perform’s public quarter-final-stage projections (10,000 sims); context, not a live final forecast.' },
  { id: 'market', label: 'Market · archived QF', blurb: 'US sportsbook quarter-final outright odds converted to implied probability (includes margin).' },
]

const fmtOr = (v, fmt = (x) => pct(x, 1)) => (v == null ? '—' : fmt(v))

/* ----------------------------------------------------------- components --- */
function Gauge({ value, size = 168 }) {
  const r = size / 2 - 12
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-gold)" strokeWidth="10"
          strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ filter: 'drop-shadow(0 0 8px rgba(255,193,7,.55))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-4xl font-black text-gold text-glow-gold">{pct(value, 1)}</span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">win the cup</span>
      </div>
    </div>
  )
}

function ChampionMeter({ contenders, matchmind }) {
  const [lens, setLens] = useState('matchmind')
  const values = lens === 'matchmind' ? matchmind : EXTERNAL[lens]
  const rows = [...contenders]
    .map((c) => ({ ...c, value: values[c.team_name] }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  const max = Math.max(...rows.map((r) => r.value ?? 0))
  const active = LENSES.find((l) => l.id === lens)

  return (
    <div className="glass-sky p-6">
      <div className="flex flex-wrap items-center gap-2">
        {LENSES.map((l) => (
          <button key={l.id} onClick={() => setLens(l.id)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
              lens === l.id
                ? 'border-celeste/60 bg-celeste/20 text-white'
                : 'border-white/10 bg-black/20 text-slate-400 hover:text-white'
            }`}>
            {l.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">{active.blurb}</p>

      <ul className="mt-5 space-y-2.5">
        {rows.map((row, i) => {
          const isArg = row.team_name === 'Argentina'
          return (
            <li key={row.team_name}
              className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                isArg ? 'border-gold/40 bg-gold/5' : 'border-white/5 bg-black/15'
              }`}
              title={`${row.team_name} — ${fmtOr(row.value)} to win the cup (${active.label})`}>
              <span className="tabular w-5 text-center text-xs font-black text-slate-500">{i + 1}</span>
              <img src={row.image_path} alt="" loading="lazy"
                className="size-9 rounded-lg object-cover ring-1 ring-white/15" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-extrabold text-white">
                    {row.team_name}
                    {isArg && <span className="ml-2 rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-gold">🏆 HOLDERS</span>}
                  </p>
                  <span className={`tabular text-sm font-black ${isArg ? 'text-gold' : 'text-celeste'}`}>
                    {fmtOr(row.value)}
                    {lens === 'market' && EXTERNAL.marketOdds[row.team_name] && (
                      <span className="ml-1.5 text-[10px] font-bold text-slate-500">{EXTERNAL.marketOdds[row.team_name]}</span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/40">
                  <motion.div
                    className={`h-full rounded-full ${isArg ? 'bg-gold' : 'bg-celeste'}`}
                    initial={false}
                    animate={{ width: row.value == null ? '0%' : `${(row.value / max) * 100}%` }}
                    transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {lens === 'opta' && (
        <p className="mt-3 text-[11px] text-slate-500">Belgium “—”: Opta’s public bracket rated Morocco in that quarter-final slot, so no comparable figure exists.</p>
      )}
      {lens === 'market' && (
        <p className="mt-3 text-[11px] text-slate-500">Raw implied probabilities include the bookmaker’s margin, so they sum past 100% — shown unadjusted on purpose.</p>
      )}
    </div>
  )
}

function ConsensusTable({ contenders, matchmind }) {
  const rows = [...contenders].sort(
    (a, b) => (matchmind[b.team_name] ?? 0) - (matchmind[a.team_name] ?? 0))
  return (
    <div className="glass overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            <th className="px-4 py-3">Team</th>
            <th className="tabular px-3 py-3 text-right">MatchMind</th>
            <th className="tabular px-3 py-3 text-right">Opta (QF)</th>
            <th className="tabular px-3 py-3 text-right">Market (QF)</th>
            <th className="px-4 py-3">Key factor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const isArg = c.team_name === 'Argentina'
            return (
              <tr key={c.team_name} className={`border-b border-white/5 last:border-0 ${isArg ? 'bg-gold/5' : ''}`}>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-bold text-white"><Flag team={c.team_name} />{c.team_name}</span>
                </td>
                <td className="tabular px-3 py-3 text-right font-bold text-celeste">{fmtOr(matchmind[c.team_name])}</td>
                <td className="tabular px-3 py-3 text-right text-slate-300">{fmtOr(EXTERNAL.opta[c.team_name])}</td>
                <td className="tabular px-3 py-3 text-right text-slate-300">{fmtOr(EXTERNAL.market[c.team_name])}</td>
                <td className="px-4 py-3 text-xs text-slate-300">{KEY_FACTOR[c.team_name]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DefenceTimeline() {
  return (
    <div className="overflow-x-auto pb-2">
      <ol className="flex min-w-max gap-2">
        {DEFENCES.map((d) => {
          const s = RESULT_STYLE[d.result]
          return (
            <li key={d.year} title={`${d.year} — ${d.champ}: ${d.note}`}
              className={`w-[86px] shrink-0 rounded-xl border p-2.5 text-center ${s.chip}`}>
              <p className="text-lg leading-none">{s.glyph}</p>
              <p className="tabular mt-1.5 text-xs font-black">{d.year}</p>
              <p className="mt-0.5 truncate text-[10px] font-semibold opacity-90">{d.champ}</p>
              <p className="mt-1 text-[9px] font-black tracking-wider">{s.label}</p>
            </li>
          )
        })}
        <li title="2026 — Argentina: the 21st title defence"
          className="w-[86px] shrink-0 rounded-xl border border-dashed border-gold/60 bg-gold/10 p-2.5 text-center text-gold">
          <p className="text-lg leading-none">❓</p>
          <p className="tabular mt-1.5 text-xs font-black">2026</p>
          <p className="mt-0.5 truncate text-[10px] font-semibold">Argentina</p>
          <p className="mt-1 text-[9px] font-black tracking-wider">ATTEMPT&nbsp;#21</p>
        </li>
      </ol>
    </div>
  )
}

function BigFact({ value, label, sub, tone = 'celeste' }) {
  const toneCls = { celeste: 'text-celeste text-glow-celeste', gold: 'text-gold text-glow-gold', red: 'text-red-300' }[tone]
  return (
    <div className="glass-sky glass-hover p-5">
      <p className={`tabular text-4xl font-black ${toneCls}`}>{value}</p>
      <p className="mt-2 text-sm font-bold text-white">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{sub}</p>
    </div>
  )
}

function MathChain({ steps, result }) {
  return (
    <div className="flex flex-wrap items-stretch gap-3">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <div className="glass-inset min-w-[150px] p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Step {i + 1}</p>
            <p className="tabular mt-1 text-2xl font-black text-celeste">{pct(s.p, 1)}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-300">{s.label}</p>
          </div>
          <span className="text-2xl font-black text-slate-500">{i < steps.length - 1 ? '×' : '='}</span>
        </div>
      ))}
      <div className="min-w-[150px] rounded-xl border border-gold/40 bg-gold/10 p-4 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gold">Champion</p>
        <p className="tabular mt-1 text-2xl font-black text-gold text-glow-gold">{pct(result, 1)}</p>
        <p className="mt-1 text-[11px] font-semibold text-slate-300">the full path, priced</p>
      </div>
    </div>
  )
}

function PriorBars({ items }) {
  const max = Math.max(...items.map((i) => i.p))
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} title={`${item.label}: ${pct(item.p, 1)} — ${item.sub}`}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-bold text-white">{item.label}</span>
            <span className={`tabular font-black ${item.tone === 'gold' ? 'text-gold' : 'text-celeste'}`}>{pct(item.p, 1)}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/40">
            <div className={`probbar-fill h-full rounded-full ${item.tone === 'gold' ? 'bg-gold' : 'bg-celeste'}`}
              style={{ width: `${(item.p / max) * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{item.sub}</p>
        </li>
      ))}
    </ul>
  )
}

function DarkHorseCard({ contender, oddsLabel, blurb }) {
  return (
    <article className="group relative min-h-56 overflow-hidden rounded-2xl border border-white/10">
      <img src={contender.image_path} alt={`${contender.team_name} World Cup visual`}
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#060a12] via-[#060a12]/60 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
        <span className="rounded-full border border-celeste/40 bg-black/45 px-2.5 py-1 text-[10px] font-black tracking-widest text-celeste backdrop-blur-md">
          🐎 DARK HORSE
        </span>
        <span className="tabular rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-md">{oddsLabel}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="text-xl font-black text-white">{contender.team_name}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">{blurb}</p>
      </div>
    </article>
  )
}

/* ----------------------------------------------------------------- page --- */
export default function Verdict() {
  const sim = useFetch(api.simulate)
  const contenders = useFetch(api.contenders)

  const derived = useMemo(() => {
    if (!sim.data || !contenders.data) return null
    const matchmind = Object.fromEntries(sim.data.title_odds.map((t) => [t.team, t.champion]))
    const arg = sim.data.title_odds.find((t) => t.team === 'Argentina')
    const argRow = contenders.data.find((c) => c.team_name === 'Argentina')
    const steps = [
      { label: 'Beat Spain in the final', p: arg.champion },
    ]
    return { matchmind, arg, argRow, steps }
  }, [sim.data, contenders.data])

  if (sim.loading || contenders.loading) return <Spinner label="Weighing ninety-six years of history…" />
  if (sim.error || contenders.error) return <ErrorBox error={sim.error || contenders.error} />

  const { matchmind, arg, argRow, steps } = derived
  const norway = contenders.data.find((c) => c.team_name === 'Norway')
  const belgium = contenders.data.find((c) => c.team_name === 'Belgium')

  return (
    <div className="space-y-14">
      {/* ------------------------------------------------------------ hero --- */}
      <FadeUp>
        <section className="relative min-h-[540px] overflow-hidden rounded-[2rem] border border-celeste/25">
          <img src={argRow.image_path} alt="Argentina — defending world champions"
            className="absolute inset-0 h-full w-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#04101f] via-[#04101f]/85 to-[#04101f]/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#04101f] via-transparent to-[#04101f]/40" />
          <div className="sky-stripes absolute inset-x-0 top-0 h-1.5 opacity-80" />

          <div className="relative z-10 grid min-h-[540px] items-end gap-8 px-6 py-10 sm:px-12 lg:grid-cols-[1fr_auto]">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gold">🏆 Defending champions</span>
                <span className="rounded-full border border-celeste/40 bg-celeste/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-celeste">Elo #1 · {argRow.elo_rating}</span>
                <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">{argRow.wins}/{argRow.matches_played} wins · perfect record</span>
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.3em] text-celeste">The Verdict · a research file, not a hot take</p>
              <h1 className="mt-3 text-5xl font-black leading-[0.95] text-white sm:text-7xl">
                Can history<br /><span className="text-celeste text-glow-celeste">repeat itself?</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                No nation has retained the World Cup since <b className="text-white">Brazil in 1962</b>.
                Twenty champions have tried; eighteen fell. Argentina now reach the final as Elo leaders with a
                perfect record. The live model gives the holders <b className="text-gold">{pct(arg.champion, 1)}</b>
                {' '}to beat Spain and retain the trophy.
              </p>
            </div>
            <div className="hidden justify-self-end pb-2 lg:block">
              <div className="glass-sky flex flex-col items-center gap-2 p-6">
                <Gauge value={arg.champion} />
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">MatchMind · {sim.data.runs.toLocaleString()} sims</p>
              </div>
            </div>
          </div>
        </section>
      </FadeUp>

      {/* -------------------------------------------------- champion meter --- */}
      <section>
        <SectionTitle kicker="One live forecast · two archived baselines" title="Who wins the cup?"
          right={<span className="text-xs text-slate-500">Verified {sim.data.as_of}</span>} />
        <div className="grid gap-6 lg:grid-cols-5">
          <FadeUp className="lg:col-span-3">
            <ChampionMeter contenders={contenders.data} matchmind={matchmind} />
          </FadeUp>
          <FadeUp delay={0.06} className="lg:col-span-2">
            <div className="glass h-full p-6">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Read the timestamps first</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                MatchMind is the only column recalculated after both semi-finals. Opta and market figures are
                preserved quarter-final snapshots, useful for seeing how the race evolved but not as current final odds.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                The final model call is clear: <b className="text-white">Spain {pct(matchmind.Spain, 1)}</b> and
                {' '}<b className="text-white">Argentina {pct(arg.champion, 1)}</b>. Spain are the pick, but
                Argentina at <b className="text-gold">{pct(arg.champion, 0)}</b> is a serious live branch, not a remote upset.
              </p>
              <p className="mt-3 rounded-lg border border-gold/20 bg-gold/5 p-3 text-sm leading-relaxed text-slate-300">
                Argentina’s live probability rose from <b className="text-gold">{pct(EXTERNAL.market.Argentina, 1)}</b>
                {' '}in the archived market snapshot to <b className="text-gold">{pct(arg.champion, 1)}</b> in the
                final-stage model because only one match now remains.
              </p>
            </div>
          </FadeUp>
        </div>
        <FadeUp delay={0.08}>
          <div className="mt-6">
            <ConsensusTable contenders={contenders.data} matchmind={matchmind} />
            <p className="mt-2 text-[11px] text-slate-500">
              Sources: MatchMind artifacts ({sim.data.as_of}) · archived Opta Analyst quarter-final projections ·
              US sportsbook outright odds, 2026-07-09. External figures are third-party estimates quoted for comparison.
            </p>
          </div>
        </FadeUp>
      </section>

      {/* -------------------------------------------------- history engine --- */}
      <section>
        <SectionTitle kicker="96 years · 20 title defences" title="The history engine" />
        <FadeUp>
          <div className="glass-sky p-6">
            <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
              Every attempt to defend the World Cup, 1938 → 2022. Gold means the champion did it again.
              Hover any card for the story.
            </p>
            <div className="mt-5"><DefenceTimeline /></div>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-400">
              <span><span className="text-gold">🏆 defended</span> · 2</span>
              <span><span className="text-celeste">🥈 lost the final</span> · 3</span>
              <span>½ ¼ ⅛ knockout exits · 8</span>
              <span className="text-red-300">✕ group-stage exits · 7</span>
            </div>
          </div>
        </FadeUp>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <FadeUp><BigFact value="10.0%" label="The base rate" sub="2 successful defences in 20 attempts since 1938. History’s cold prior for any champion." tone="gold" /></FadeUp>
          <FadeUp delay={0.04}><BigFact value="64 yrs" label="The drought" sub="Brazil 1962 was the last repeat. 15 straight defences have failed since." tone="red" /></FadeUp>
          <FadeUp delay={0.08}><BigFact value="87.5%" label="The Americas rule" sub="7 of 8 World Cups hosted in the Americas were won by a South American team. 2026 is the 9th." /></FadeUp>
          <FadeUp delay={0.12}><BigFact value="3 finals" label="The near-misses" sub="Argentina ’90, Brazil ’98, France ’22 — champions keep reaching the final. The last step is the wall." /></FadeUp>
        </div>

        <FadeUp delay={0.1}>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="glass p-6">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">The Americas rule, in full</h3>
              <ul className="mt-4 space-y-2">
                {AMERICAS.map((wc) => (
                  <li key={wc.year} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                    wc.conmebol ? 'border-celeste/20 bg-celeste/5' : 'border-red-400/20 bg-red-400/5'}`}>
                    <span className="tabular font-black text-white">{wc.year}</span>
                    <span className="text-slate-300">hosted by {wc.host}</span>
                    <span className={`font-bold ${wc.conmebol ? 'text-celeste' : 'text-red-300'}`}>
                      {wc.winner} {wc.conmebol ? '· CONMEBOL ✓' : '· UEFA ✗'}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between rounded-lg border border-dashed border-gold/40 bg-gold/5 px-3 py-2 text-xs">
                  <span className="tabular font-black text-gold">2026</span>
                  <span className="text-slate-300">hosted by USA · Canada · Mexico</span>
                  <span className="font-bold text-gold">? · one CONMEBOL side left</span>
                </li>
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Honest caveat: 8 tournaments is a small sample, and 2014 already broke the rule.
                Patterns explain the past — probabilities price the future.
              </p>
            </div>
            <div className="glass p-6">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Why champions fail — and why Argentina might not</h3>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <li><b className="text-red-300">✕ The usual killers:</b> ageing cores kept together one cycle too long (France ’02, Spain ’14, Germany ’18) and the group-stage ambush — 7 of 18 failed defences never left the groups.</li>
                <li><b className="text-celeste">✓ Argentina dodged killer #1:</b> Scaloni rebuilt around the Qatar core — the snapshot shows a perfect {argRow.wins}/{argRow.matches_played}, {argRow.goals_for_per_match} goals per game and verified defensive xG of {argRow.verified_xg_against_per_match}/game.</li>
                <li><b className="text-celeste">✓ The path is down to one game:</b> Argentina survived England’s lead and won 2–1, so there is no remaining bracket uncertainty before the final.</li>
                <li><b className="text-gold">⚠ What remains:</b> Spain — six wins, one shootout draw and the model’s {pct(matchmind.Spain, 1)} cup favourite.</li>
              </ul>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ------------------------------------------------- the mathematics --- */}
      <section>
        <SectionTitle kicker="Show the working" title="The mathematics of a repeat" />
        <FadeUp>
          <div className="glass-sky p-6">
            <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
              A championship probability isn’t a feeling. With Argentina already in the final, the full title
              path is now one conditional step, priced across {sim.data.runs.toLocaleString()} simulations:
            </p>
            <div className="mt-5"><MathChain steps={steps} result={arg.champion} /></div>
            <p className="mt-4 text-[11px] text-slate-500">
              The model combines the 90-minute outcome with extra time and penalties. The resulting
              {' '}<b className="text-celeste">{pct(arg.champion, 1)}</b> is Argentina’s complete championship probability.
            </p>
          </div>
        </FadeUp>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <FadeUp>
            <div className="glass h-full p-6">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Prior vs evidence — Argentina’s number, four ways</h3>
              <div className="mt-5">
                <PriorBars items={[
                  { label: 'History’s base rate', p: 0.10, sub: '2 repeats in 20 defences — knows nothing about this squad', tone: 'celeste' },
                  { label: 'MatchMind (200k sims)', p: arg.champion, sub: 'Elo, form, xG and the exact bracket path', tone: 'celeste' },
                  { label: 'Opta supercomputer', p: EXTERNAL.opta.Argentina, sub: 'Archived independent model, QF stage', tone: 'celeste' },
                  { label: 'Betting market', p: EXTERNAL.market.Argentina, sub: 'Archived QF market · includes bookmaker margin', tone: 'gold' },
                ]} />
              </div>
            </div>
          </FadeUp>
          <FadeUp delay={0.06}>
            <div className="glass h-full p-6">
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">What the gap means</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Treat history’s <b className="text-white">10%</b> as a prior, then update on what 2026 actually
                shows: the <b className="text-white">#1 Elo team</b>, the only perfect record, the field’s best
                defence — and a surviving group stage that killed 7 of the 18 failed defences before Argentina
                even reached this point.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                The archived 17–20% figures were measured with three knockout rounds still unresolved. Reaching
                the final removes two failure branches; the live estimate is now <b className="text-celeste">{pct(arg.champion, 1)}</b>.
                That change is bracket logic, not a contradiction.
              </p>
              <p className="mt-3 rounded-lg border border-celeste/20 bg-celeste/5 p-3 text-sm leading-relaxed text-slate-300">
                Both teams are now confirmed finalists, so bracket position is equal. Spain’s
                {' '}<b className="text-white">{pct(matchmind.Spain, 1)}</b> edge comes from the current matchup
                model: stronger recent defensive control and a {pct(matchmind.Spain, 1)} estimated chance to advance through all
                final-resolution paths, including extra time and penalties.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ------------------------------------------------------ dark horses --- */}
      {(norway || belgium) && <section>
        <SectionTitle kicker="Respect the outsiders" title="Dark horses the models can’t fully price" />
        <div className="grid gap-4 sm:grid-cols-2">
          {norway && (
            <FadeUp><DarkHorseCard contender={norway} oddsLabel="15/1 market"
              blurb="A 44th-ranked FIFA side in a quarter-final sounds like a fairy tale — until you remember Erling Haaland. Models price teams; one man scoring in every round breaks team-level mathematics." /></FadeUp>
          )}
          {belgium && (
            <FadeUp delay={0.05}><DarkHorseCard contender={belgium} oddsLabel="30/1 market"
              blurb="Golden Generation 2.0 — younger, hungrier, and still unbeaten this tournament. The 2.6 goals per game say the attack is real; the 1.0 conceded says the risk is too." /></FadeUp>
          )}
        </div>
      </section>}

      {/* ---------------------------------------------------- final verdict --- */}
      <FadeUp>
        <section className="relative overflow-hidden rounded-[2rem] border border-gold/25">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0c1b30] via-[#0a0e17] to-[#1a1503]" />
          <div className="sun-spin absolute -right-24 -top-24 size-72 rounded-full opacity-20"
            style={{ background: 'conic-gradient(from 0deg, transparent 0 10deg, rgba(255,193,7,.6) 10deg 14deg, transparent 14deg 26deg, rgba(255,193,7,.6) 26deg 30deg, transparent 30deg 42deg, rgba(255,193,7,.6) 42deg 46deg, transparent 46deg 58deg, rgba(255,193,7,.6) 58deg 62deg, transparent 62deg 74deg, rgba(255,193,7,.6) 74deg 78deg, transparent 78deg 90deg)' }} />
          <div className="relative z-10 p-8 sm:p-12">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gold">The verdict</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-white sm:text-4xl">
              So — can Argentina do what no one has done in 64 years?
            </h2>
            <div className="mt-6 grid max-w-4xl gap-4 text-sm leading-relaxed text-slate-300 sm:grid-cols-2">
              <p>
                <b className="text-celeste">The case for:</b> Elo #1 at {argRow.elo_rating}, the only perfect record
                left, {argRow.goals_for_per_match} goals per match, the Americas rule at 87.5%, a winning mentality the market
                literally pays a premium for — and Messi’s last dance ending on this continent.
              </p>
              <p>
                <b className="text-gold">The honest answer:</b> Spain are the rightful favourite in the live
                model at {pct(matchmind.Spain, 1)}. Argentina still hold {pct(arg.champion, 1)} — roughly two chances
                in five — so the logical pick is Spain, not a certainty. One final decides whether history repeats.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/bracket" className="rounded-xl bg-celeste px-5 py-3 text-sm font-black text-[#04101f] shadow-[0_0_28px_rgba(108,172,228,.35)]">Simulate the bracket yourself</Link>
              <Link to="/predict" className="glass px-5 py-3 text-sm font-bold text-white">Price any single matchup</Link>
              <Link to="/methodology" className="glass px-5 py-3 text-sm font-bold text-slate-300">How the model works</Link>
            </div>
          </div>
        </section>
      </FadeUp>

      <p className="text-center text-[11px] leading-relaxed text-slate-600">
        Research file compiled {sim.data.as_of}. External benchmarks: archived Opta Analyst (theanalyst.com) QF-stage projections ·
        US sportsbook outright markets via ESPN/FOX Sports, 2026-07-09. Historical records: FIFA World Cup archives, 1930–2022.
        Probabilities are estimates, not promises — that’s the whole point of this page.
      </p>
    </div>
  )
}
