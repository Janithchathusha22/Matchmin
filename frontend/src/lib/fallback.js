const STATIC_MAP = {
  '/api/health': '/static-api/health.json',
  '/api/teams': '/static-api/teams.json',
  '/api/contenders': '/static-api/contenders.json',
  '/api/simulate': '/static-api/simulate.json',
  '/api/bracket': '/static-api/bracket.json',
  '/api/network': '/static-api/network.json',
  '/api/model/metrics': '/static-api/metrics.json',
  '/api/accuracy': '/static-api/accuracy.json',
}

const FEATURE_NAMES = [
  'elo_home', 'elo_away', 'elo_diff',
  'winrate5_home', 'winrate5_away',
  'goals_for5_home', 'goals_for5_away',
  'goals_against5_home', 'goals_against5_away',
  'is_knockout',
]

const staticCache = new Map()

async function staticJson(path) {
  if (staticCache.has(path)) return staticCache.get(path)
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  const data = await res.json()
  staticCache.set(path, data)
  return data
}

export async function getStaticFallback(path) {
  if (path.startsWith('/api/teams/')) {
    const name = decodeURIComponent(path.slice('/api/teams/'.length))
    const profiles = await staticJson('/static-api/team-profiles.json')
    if (!profiles[name]) throw new Error(`Unknown team: ${name}`)
    return profiles[name]
  }
  const fallbackPath = STATIC_MAP[path]
  if (!fallbackPath) throw new Error(`No static fallback for ${path}`)
  return staticJson(fallbackPath)
}

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const round = (value, digits = 4) => Number(value.toFixed(digits))
const sigmoid = (value) => 1 / (1 + Math.exp(-value))

function featureRow(home, away, knockout, teams, form) {
  const teamMap = new Map(teams.map((team) => [team.name, team]))
  const homeTeam = teamMap.get(home)
  const awayTeam = teamMap.get(away)
  if (!homeTeam || !awayTeam) throw new Error(`Unknown team: ${!homeTeam ? home : away}`)
  const homeForm = form[home] ?? { winrate5: 0.4, goals_for5: 1.35, goals_against5: 1.35 }
  const awayForm = form[away] ?? { winrate5: 0.4, goals_for5: 1.35, goals_against5: 1.35 }
  return {
    elo_home: homeTeam.elo,
    elo_away: awayTeam.elo,
    elo_diff: homeTeam.elo - awayTeam.elo,
    winrate5_home: homeForm.winrate5,
    winrate5_away: awayForm.winrate5,
    goals_for5_home: homeForm.goals_for5,
    goals_for5_away: awayForm.goals_for5,
    goals_against5_home: homeForm.goals_against5,
    goals_against5_away: awayForm.goals_against5,
    is_knockout: knockout ? 1 : 0,
  }
}

function predictModel(model, row) {
  const x = model.feature_names.map((name) => row[name])
  const totals = [0, 0, 0]
  for (const classifier of model.classifiers) {
    const scaled = x.map((value, i) => (value - classifier.mean[i]) / classifier.scale[i])
    const calibrated = classifier.coef.map((coef, classIndex) => {
      const score = coef.reduce((sum, weight, i) => sum + weight * scaled[i], classifier.intercept[classIndex])
      const cal = classifier.calibrators[classIndex]
      return sigmoid(-(cal.a * score + cal.b))
    })
    const denom = calibrated.reduce((sum, value) => sum + value, 0) || 1
    calibrated.forEach((value, i) => { totals[i] += value / denom })
  }
  return totals.map((value) => value / model.classifiers.length)
}

function factorial(n) {
  let out = 1
  for (let i = 2; i <= n; i += 1) out *= i
  return out
}

function expectedGoals(strengths, team, opponent) {
  const mu = strengths.mu
  const attack = strengths.attack[team] ?? 0
  const defense = strengths.defense[opponent] ?? 0
  return Math.exp(mu + attack + defense)
}

function poissonPmf(k, lambda) {
  return Math.exp(-lambda) * (lambda ** k) / factorial(k)
}

function scoreMatrix(strengths, home, away, scale = 1) {
  const xgHome = expectedGoals(strengths, home, away) * scale
  const xgAway = expectedGoals(strengths, away, home) * scale
  const matrix = []
  for (let h = 0; h <= 8; h += 1) {
    const row = []
    for (let a = 0; a <= 8; a += 1) row.push(poissonPmf(h, xgHome) * poissonPmf(a, xgAway))
    matrix.push(row)
  }
  return { matrix, xgHome, xgAway }
}

function poissonOutcome(strengths, home, away) {
  const { matrix, xgHome, xgAway } = scoreMatrix(strengths, home, away)
  let homeProb = 0
  let drawProb = 0
  let awayProb = 0
  let total = 0
  for (let h = 0; h <= 8; h += 1) {
    for (let a = 0; a <= 8; a += 1) {
      const value = matrix[h][a]
      total += value
      if (h > a) homeProb += value
      else if (h === a) drawProb += value
      else awayProb += value
    }
  }
  return {
    home: homeProb / total,
    draw: drawProb / total,
    away: awayProb / total,
    xg_home: xgHome,
    xg_away: xgAway,
  }
}

function topScorelines(strengths, home, away, n = 6) {
  const { matrix } = scoreMatrix(strengths, home, away)
  const flat = []
  for (let h = 0; h <= 8; h += 1) {
    for (let a = 0; a <= 8; a += 1) flat.push({ home_goals: h, away_goals: a, prob: round(matrix[h][a]) })
  }
  return flat.sort((a, b) => b.prob - a.prob).slice(0, n)
}

function extraTimeOutcome(strengths, home, away) {
  const { matrix } = scoreMatrix(strengths, home, away, 1 / 3)
  let homeProb = 0
  let drawProb = 0
  let awayProb = 0
  let total = 0
  for (let h = 0; h <= 8; h += 1) {
    for (let a = 0; a <= 8; a += 1) {
      const value = matrix[h][a]
      total += value
      if (h > a) homeProb += value
      else if (h === a) drawProb += value
      else awayProb += value
    }
  }
  return { home: homeProb / total, draw: drawProb / total, away: awayProb / total }
}

function knockoutAdvance(p90, strengths, home, away, eloHome, eloAway) {
  const et = extraTimeOutcome(strengths, home, away)
  const penaltyHome = clamp(1 / (1 + (10 ** (-(eloHome - eloAway) / 800))), 0.4, 0.6)
  const homeGivenDraw = et.home + et.draw * penaltyHome
  return {
    home: clamp(p90[0] + p90[1] * homeGivenDraw),
    extra_time: et,
    penalty_home: penaltyHome,
    home_given_90m_draw: homeGivenDraw,
  }
}

function explain(model, row, baseline) {
  const names = FEATURE_NAMES
  const n = names.length
  const values = []
  for (let mask = 0; mask < (1 << n); mask += 1) {
    const mixed = {}
    for (let i = 0; i < n; i += 1) mixed[names[i]] = (mask & (1 << i)) ? row[names[i]] : baseline[names[i]]
    values[mask] = predictModel(model, mixed)[0]
  }
  const factorials = Array.from({ length: n + 1 }, (_, i) => factorial(i))
  const contributions = names.map((name, j) => {
    let phi = 0
    const bit = 1 << j
    for (let mask = 0; mask < (1 << n); mask += 1) {
      if (mask & bit) continue
      const size = mask.toString(2).split('1').length - 1
      const weight = (factorials[size] * factorials[n - size - 1]) / factorials[n]
      phi += weight * (values[mask | bit] - values[mask])
    }
    return {
      feature: name,
      value: round(row[name]),
      baseline: round(baseline[name]),
      contribution: round(phi, 5),
    }
  })
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  return {
    method: 'exact_baseline_shapley_static',
    target: 'home_win_90m',
    base_probability: round(values[0], 5),
    predicted_probability: round(values[(1 << n) - 1], 5),
    contributions,
  }
}

export async function predictStaticFallback(home, away, knockout) {
  const [teams, form, model, poisson, metrics, simulation] = await Promise.all([
    getStaticFallback('/api/teams'),
    staticJson('/static-api/form.json'),
    staticJson('/static-api/model.json'),
    staticJson('/static-api/poisson.json'),
    getStaticFallback('/api/model/metrics'),
    getStaticFallback('/api/simulate'),
  ])
  const row = featureRow(home, away, knockout, teams, form)
  const p = predictModel(model, row)
  const pois = poissonOutcome(poisson, home, away)
  const teamMap = new Map(teams.map((team) => [team.name, team]))
  const advance = knockout
    ? knockoutAdvance(p, poisson, home, away, teamMap.get(home).elo, teamMap.get(away).elo)
    : null
  const poissonAdvance = knockout
    ? knockoutAdvance([pois.home, pois.draw, pois.away], poisson, home, away, teamMap.get(home).elo, teamMap.get(away).elo).home
    : pois.home
  const homeTarget = advance ? advance.home : p[0]
  const disagreement = Math.abs((advance ? advance.home : p[0]) - poissonAdvance)
  const confidence = disagreement < 0.1 && Math.abs(homeTarget - 0.5) >= 0.15
    ? 'high'
    : disagreement < 0.18 ? 'medium' : 'low'

  return {
    home,
    away,
    knockout,
    probs: { home: round(p[0]), draw: round(p[1]), away: round(p[2]) },
    advance_prob_home: advance ? round(advance.home) : null,
    knockout_resolution: advance ? {
      extra_time: Object.fromEntries(Object.entries(advance.extra_time).map(([key, value]) => [key, round(value)])),
      penalty_home: round(advance.penalty_home),
    } : null,
    expected_goals: { home: round(pois.xg_home, 2), away: round(pois.xg_away, 2) },
    top_scorelines: topScorelines(poisson, home, away, 6),
    features: Object.fromEntries(FEATURE_NAMES.map((name) => [name, round(row[name], 3)])),
    explanation: explain(model, row, metrics.feature_baseline),
    model_votes: [
      {
        model: 'baseline_elo_logreg',
        home_probability: round(p[0]),
        home_advance: round(advance ? advance.home : p[0]),
      },
      {
        model: 'bayesian_poisson_proxy',
        home_probability: round(pois.home),
        home_advance: round(poissonAdvance),
      },
    ],
    model_disagreement: round(disagreement),
    confidence,
    upset_index: round(Math.min(homeTarget, 1 - homeTarget)),
    data_as_of: simulation.as_of,
    model: `${metrics.best_model} (static fallback)`,
  }
}
