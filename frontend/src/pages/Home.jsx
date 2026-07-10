import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api, pct } from '../lib/api'
import { ErrorBox, FadeUp, Flag, Spinner, useFetch } from '../components/ui.jsx'

const Arrow = ({ className = 'size-4' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Spark = ({ className = 'size-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.75c.45 5.47 3.78 8.8 9.25 9.25-5.47.45-8.8 3.78-9.25 9.25C11.55 15.78 8.22 12.45 2.75 12 8.22 11.55 11.55 8.22 12 2.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
)

const Target = ({ className = 'size-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
    <path d="m14.5 9.5 5-5m0 0v3.2m0-3.2h-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function formatDate(value) {
  if (!value) return 'TBC'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
    .format(new Date(`${value}T00:00:00`))
}

function ChampionRing({ value }) {
  const degrees = Math.round(value * 360)
  return (
    <div
      className="champion-ring"
      style={{ '--ring-value': `${degrees}deg` }}
      aria-label={`${pct(value, 1)} championship probability`}
    >
      <div>
        <span>{pct(value, 1)}</span>
        <small>win cup</small>
      </div>
    </div>
  )
}

function Hero({ favourite, simulation, accuracy }) {
  const nextMatch = simulation.upcoming[0]
  return (
    <FadeUp>
      <section className="hero-stage" aria-labelledby="home-title">
        <img src="/matchmind-hero-v2.jpg" alt="A golden football trophy under stadium lights" className="hero-stage__image" />
        <div className="hero-stage__wash" />
        <div className="hero-stage__grid" />
        <div className="hero-orb hero-orb--one" />
        <div className="hero-orb hero-orb--two" />

        <div className="relative z-10 grid min-h-[680px] lg:grid-cols-[minmax(0,1.18fr)_minmax(350px,.82fr)]">
          <div className="flex flex-col justify-center px-6 py-14 sm:px-10 lg:px-14 lg:py-20">
            <div className="flex flex-wrap items-center gap-3">
              <span className="live-pill">
                <span className="live-pill__dot" /> Live tournament intelligence
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Updated {simulation.as_of}
              </span>
            </div>

            <p className="mt-10 flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-gold">
              <Spark className="size-4" /> 200,000 possible futures
            </p>
            <h1 id="home-title" className="mt-4 max-w-3xl text-[clamp(3.4rem,7vw,6.7rem)] font-black leading-[.88] tracking-[-0.065em] text-white">
              See the game <span className="hero-title-accent">before it happens.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              MatchMind turns decades of football history into calibrated match probabilities,
              scorelines, and a living path to the 2026 trophy.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/predict" className="button-primary group">
                Predict a match <Arrow className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link to="/bracket" className="button-glass group">
                Explore live bracket <Arrow className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="mt-12 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
              <div className="hero-proof">
                <b>{accuracy.matches_scored}</b>
                <span>games scored</span>
              </div>
              <div className="hero-proof">
                <b>{pct(accuracy.accuracy, 1)}</b>
                <span>model accuracy</span>
              </div>
              <div className="hero-proof">
                <b>{simulation.runs.toLocaleString()}</b>
                <span>simulations</span>
              </div>
            </div>
          </div>

          <div className="relative flex min-h-[420px] items-end justify-center px-5 pb-7 lg:justify-end lg:px-10 lg:pb-10">
            <motion.div
              className="hero-signal glass-shine w-full max-w-[390px]"
              initial={{ opacity: 0, x: 24, y: 12 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: .7, delay: .28, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.22em] text-slate-400">Champion signal</p>
                  <div className="mt-2 flex items-center gap-2.5">
                    <Flag team={favourite.team_name} className="h-6 w-9" size={80} />
                    <p className="text-xl font-black text-white">{favourite.team_name}</p>
                  </div>
                </div>
                <span className="rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gold">
                  Model #1
                </span>
              </div>

              <div className="mt-5 flex items-center gap-5">
                <ChampionRing value={favourite.odds.champion} />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                      <span>Reach final</span><b className="text-white">{pct(favourite.odds.reach_final, 1)}</b>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gold" style={{ width: pct(favourite.odds.reach_final, 1) }} /></div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                      <span>Current form</span><b className="text-accent">{favourite.form_points_per_match.toFixed(1)} PPG</b>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-full rounded-full bg-accent" /></div>
                  </div>
                </div>
              </div>

              {nextMatch && (
                <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-xs">
                  <span className="text-slate-400">Next model call</span>
                  <span className="flex items-center gap-2 font-bold text-white">
                    {nextMatch.home} <span className="text-slate-500">vs</span> {nextMatch.away}
                  </span>
                </div>
              )}
            </motion.div>

            <div className="absolute right-7 top-[22%] hidden rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl xl:block">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-300">
                <Target className="size-4 text-accent" /> calibrated edge
              </div>
            </div>
          </div>
        </div>
      </section>
    </FadeUp>
  )
}

function MatchCard({ match, featured = false }) {
  const awayAdvance = 1 - match.advance_prob_home
  const homeIsPick = match.pick === match.home
  return (
    <article className={`match-glass group ${featured ? 'match-glass--featured' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_rgba(65,255,154,.8)]" />
          <span className="text-[10px] font-black uppercase tracking-[.2em] text-accent">Upcoming</span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[.15em] text-slate-400">{formatDate(match.date)}</span>
      </div>

      <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          <Flag team={match.home} className="h-8 w-12 shadow-lg" size={80} />
          <h3 className="mt-3 text-lg font-black text-white">{match.home}</h3>
          <p className={`mt-1 text-xs font-bold ${homeIsPick ? 'text-accent' : 'text-slate-400'}`}>{pct(match.advance_prob_home, 1)} advance</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1.5 text-[10px] font-black text-slate-500">VS</span>
        <div className="text-right">
          <Flag team={match.away} className="ml-auto h-8 w-12 shadow-lg" size={80} />
          <h3 className="mt-3 text-lg font-black text-white">{match.away}</h3>
          <p className={`mt-1 text-xs font-bold ${!homeIsPick ? 'text-accent' : 'text-slate-400'}`}>{pct(awayAdvance, 1)} advance</p>
        </div>
      </div>

      <div className="mt-6 flex h-1.5 overflow-hidden rounded-full bg-white/5">
        <span className="bg-home transition-all duration-700" style={{ width: pct(match.probs.H, 1) }} />
        <span className="bg-drawc transition-all duration-700" style={{ width: pct(match.probs.D, 1) }} />
        <span className="bg-away transition-all duration-700" style={{ width: pct(match.probs.A, 1) }} />
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs">
        <span className="text-slate-400">Model pick <b className="text-white">{match.pick}</b></span>
        <span className="rounded-lg bg-white/[.06] px-2.5 py-1.5 font-bold text-slate-200">
          Score {match.top_scorelines[0].home_goals}–{match.top_scorelines[0].away_goals}
        </span>
      </div>
    </article>
  )
}

function TitleRace({ odds }) {
  const max = odds[0]?.champion || 1
  return (
    <div className="odds-panel glass-shine">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Tournament forecast</p>
          <h2 className="section-heading">The race for one trophy.</h2>
        </div>
        <p className="max-w-xs text-sm leading-6 text-slate-400">Every bar is the result of 200,000 complete knockout paths—not a fan vote.</p>
      </div>
      <div className="space-y-4">
        {odds.map((team, index) => (
          <div key={team.team} className="grid grid-cols-[26px_minmax(82px,110px)_1fr_54px] items-center gap-3">
            <span className="text-xs font-bold text-slate-600">{String(index + 1).padStart(2, '0')}</span>
            <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
              <Flag team={team.team} className="h-4 w-6 shrink-0" />
              <span className="truncate">{team.team}</span>
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-white/[.06]">
              <motion.span
                className={`block h-full rounded-full ${index === 0 ? 'bg-gold shadow-[0_0_14px_rgba(246,199,92,.45)]' : 'bg-gradient-to-r from-[#25c77b] to-[#72e8b2]'}`}
                initial={{ width: 0 }}
                whileInView={{ width: `${(team.champion / max) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: .85, delay: index * .06, ease: [0.2, .8, .2, 1] }}
              />
            </div>
            <span className={`tabular text-right text-sm font-black ${index === 0 ? 'text-gold' : 'text-white'}`}>{pct(team.champion, 1)}</span>
          </div>
        ))}
      </div>
      <Link to="/bracket" className="mt-8 inline-flex items-center gap-2 text-sm font-black text-accent hover:text-white">
        Explore every path <Arrow />
      </Link>
    </div>
  )
}

function FavouriteCard({ favourite }) {
  return (
    <article className="favourite-card glass-shine">
      <img src={favourite.image_path} alt={`${favourite.team_name} tournament contender`} className="absolute inset-0 h-full w-full object-cover transition duration-700 hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#05090c] via-[#05090c]/35 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
        <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-white backdrop-blur-xl">Most likely champion</span>
        <Flag team={favourite.team_name} className="h-6 w-9" size={80} />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-gold">Model confidence</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-4xl font-black tracking-tight text-white">{favourite.team_name}</h3>
            <p className="mt-2 text-sm text-slate-300">Unbeaten · {favourite.goals_for_per_match.toFixed(1)} goals per match</p>
          </div>
          <strong className="text-4xl font-black text-gold text-glow-gold">{pct(favourite.odds.champion, 1)}</strong>
        </div>
      </div>
    </article>
  )
}

const FEATURES = [
  {
    number: '01', title: 'Calibrated predictions',
    copy: 'A validation-weighted model turns form, Elo strength, context, and history into honest probabilities.',
  },
  {
    number: '02', title: 'Scoreline intelligence',
    copy: 'Poisson modelling estimates expected goals, likely scorelines, extra time, and penalty branches.',
  },
  {
    number: '03', title: 'Tournament simulation',
    copy: 'Two hundred thousand full bracket runs reveal every team’s evolving path to the final.',
  },
]

function ModelStory({ accuracy }) {
  const recent = [...accuracy.matches].slice(-4).reverse()
  return (
    <section className="story-panel">
      <div className="grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
        <div>
          <p className="eyebrow">Built to explain itself</p>
          <h2 className="section-heading max-w-lg">Intelligence you can inspect, not just trust.</h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">Every call exposes the signal behind it—from recent form and Elo movement to exact scorelines and model disagreement.</p>
          <Link to="/methodology" className="button-glass mt-7 inline-flex">See our methodology <Arrow /></Link>
        </div>

        <div className="glass-shine rounded-[1.5rem] border border-white/10 bg-black/20 p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-slate-500">Recent calls</p>
              <p className="mt-1 text-sm font-bold text-white">Live accuracy ledger</p>
            </div>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-black text-accent">{accuracy.correct}/{accuracy.matches_scored} correct</span>
          </div>
          <div className="mt-2 divide-y divide-white/[.06]">
            {recent.map((match) => (
              <div key={match.match_id} className="grid grid-cols-[1fr_auto] items-center gap-4 py-3.5 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-[10px] font-black ${match.correct ? 'bg-accent/10 text-accent' : 'bg-red-400/10 text-red-300'}`}>{match.correct ? 'HIT' : 'MISS'}</span>
                  <span className="truncate font-semibold text-slate-200">{match.home} <b className="text-white">{match.home_score}–{match.away_score}</b> {match.away}</span>
                </div>
                <span className="hidden text-xs text-slate-500 sm:block">{match.stage}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const sim = useFetch(api.simulate)
  const acc = useFetch(api.accuracy)
  const contenders = useFetch(api.contenders)

  if (sim.loading || acc.loading || contenders.loading) return <Spinner label="Loading tournament intelligence…" />
  if (sim.error || acc.error || contenders.error) return <ErrorBox error={sim.error || acc.error || contenders.error} />

  const favourite = contenders.data[0]

  return (
    <div className="home-page space-y-24 pb-8">
      <Hero favourite={favourite} simulation={sim.data} accuracy={acc.data} />

      <section aria-labelledby="upcoming-title">
        <FadeUp>
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Next on the road to glory</p>
              <h2 id="upcoming-title" className="section-heading">The matches that change everything.</h2>
            </div>
            <Link to="/predict" className="inline-flex items-center gap-2 text-sm font-black text-accent hover:text-white">Open match lab <Arrow /></Link>
          </div>
        </FadeUp>
        <div className="grid gap-4 lg:grid-cols-3">
          {sim.data.upcoming.map((match, index) => (
            <FadeUp key={match.match_id} delay={index * .07}>
              <MatchCard match={match} featured={index === 0} />
            </FadeUp>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.38fr_.72fr]" aria-label="Championship forecast">
        <FadeUp><TitleRace odds={sim.data.title_odds} /></FadeUp>
        <FadeUp delay={.08} className="h-full"><FavouriteCard favourite={favourite} /></FadeUp>
      </section>

      <section aria-labelledby="model-title">
        <FadeUp>
          <div className="mb-7 max-w-2xl">
            <p className="eyebrow">One engine · three layers</p>
            <h2 id="model-title" className="section-heading">From raw data to a match-day edge.</h2>
          </div>
        </FadeUp>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <FadeUp key={feature.number} delay={index * .07}>
              <article className="principle-card glass-shine">
                <span>{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            </FadeUp>
          ))}
        </div>
      </section>

      <FadeUp><ModelStory accuracy={acc.data} /></FadeUp>

      <FadeUp>
        <section className="cta-panel">
          <div className="cta-panel__glow" />
          <div className="relative z-10 max-w-2xl">
            <p className="eyebrow">Your call starts here</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-.04em] text-white sm:text-5xl">Two teams. One prediction. Every signal explained.</h2>
          </div>
          <Link to="/predict" className="button-primary relative z-10 shrink-0">Build a prediction <Arrow /></Link>
        </section>
      </FadeUp>
    </div>
  )
}
