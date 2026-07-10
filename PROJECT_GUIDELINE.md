# ⚽ MatchMind — FIFA World Cup 2026 AI Prediction & Analytics Platform

> **Full project guideline** — combines the best ideas from 4 researched projects into one
> end-to-end system: **Python ML backend + React frontend**, with a unique
> **graph-theory network analysis** module that no typical prediction app has.

---

## 1. Why this project is special (the creative hook)

The FIFA World Cup 2026 is **live right now** (July 2026 — quarterfinals: France vs Morocco,
Spain vs Belgium, Norway vs England, Argentina vs Switzerland/Colombia). This means:

- We train the model on **49,000+ historical matches (1872–2026)**.
- We **predict the remaining QF / SF / Final matches** before they happen.
- We **validate our predictions against real results within days** — a live accuracy
  scoreboard is the perfect showcase feature ("Our model predicted 6/8 knockout games correctly").

No other portfolio project can be graded by reality in real time.

---

## 2. Research summary — what we take from each analyzed project

| Source project | What it did | What we take |
|---|---|---|
| **ML Prediction System** (Streamlit + Colab) | 49k matches, 25+ features, 4 models compared (LogReg, RF, GradBoost, ExtraTrees) | The full **ML pipeline**: feature engineering + multi-model comparison + evaluation — but deployed properly (FastAPI), not Colab+Ngrok |
| **Network Analysis** (PhD graph-theory project) | BFS/DFS, degree/betweenness/closeness/eigenvector centrality on WC2026 fixtures | The **NetworkX graph module** — our unique differentiator: interactive team-network visualization with centrality insights |
| **worldcup-tracker** ([github.com/Tanish-Dev/worldcup-tracker](https://github.com/Tanish-Dev/worldcup-tracker)) | Next.js dashboard, Poisson attack/defense ratings, 50,000 Monte Carlo simulations, PWA | The **architecture pattern** (Python model → JSON → frontend), **Poisson scoreline model**, **Monte Carlo bracket simulator**, clean dashboard UX |
| **Next.js predictions app** | Predictions + news section, dark immersive UI, smooth animations | The **design language**: dark theme, glassmorphism cards, smooth animations, news section |

---

## 3. Tech stack (recommended)

| Layer | Technology | Why |
|---|---|---|
| Data & ML | **Python 3.11+, pandas, scikit-learn, NetworkX** | Industry standard; matches all research projects |
| Scoreline model | **Poisson regression** (attack/defense ratings) | Predicts actual scores (2–1, not just "win") |
| Backend API | **FastAPI + Uvicorn** | Modern, auto-docs at `/docs`, async, easy deploy |
| Frontend | **React 18 + Vite + Tailwind CSS** | Fast dev experience; simpler than Next.js for an SPA dashboard |
| Charts | **Recharts** | Same as reference repo; React-native charting |
| Graph viz | **react-force-graph** (or Cytoscape.js) | Interactive network visualization |
| Deployment | **Vercel** (frontend) + **Render / Hugging Face Spaces** (FastAPI, free tier) | Real deployment, not Colab+Ngrok |

*(Alternative: skip FastAPI and pre-generate all JSON with Python like worldcup-tracker does —
simpler hosting, but you lose the "enter any two teams" live prediction. We recommend FastAPI.)*

---

## 4. Data sources (all free)

1. **Match history** — Kaggle: [International football results 1872–2026 (martj42)](https://www.kaggle.com/datasets/martj42/international-football-results-from-1872-to-2017)
   - `results.csv` (~49,000 matches: date, teams, score, tournament, city, country, neutral)
   - `shootouts.csv`, `goalscorers.csv`
   - Also mirrored on GitHub: [martj42/international_results](https://github.com/martj42/international_results)
2. **FIFA rankings** — Kaggle FIFA/Elo ranking datasets (for cold-start calibration), or compute our own **Elo ratings** from the match history (better — one less dependency).
3. **WC2026 fixtures & live results** — 48 teams, 104 matches, 12 groups, 16 host cities. Store as a hand-curated `wc2026_fixtures.json` (group stage + knockout results so far), updatable as the tournament progresses. Sources: [Wikipedia knockout stage](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage), [ESPN schedule](https://www.espn.com/soccer/story/_/id/48939282/2026-fifa-world-cup-fixtures-results-match-schedule-group-stage-knockout-rounds-bracket).
4. **News (stretch goal)** — free RSS feeds (BBC Football, ESPN) rendered in a News page.

---

## 5. System architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PYTHON  (backend/)                       │
│                                                              │
│  data/raw ──► pipeline/clean.py ──► pipeline/features.py     │
│                                          │                   │
│                              25+ engineered features         │
│                                          │                   │
│                    ┌─────────────────────┼────────────────┐  │
│                    ▼                     ▼                ▼  │
│            models/outcome.py     models/poisson.py  graph/  │
│            (LogReg, RF, GB, ET)  (scorelines)     network.py │
│                    │                     │        (NetworkX) │
│                    └──────► simulate/monte_carlo.py          │
│                                          │                   │
│                                   FastAPI  (api/main.py)     │
└──────────────────────────────┬───────────────────────────────┘
                               │ REST JSON
┌──────────────────────────────▼───────────────────────────────┐
│                   REACT + VITE  (frontend/)                   │
│   Home │ Predict │ Bracket │ Teams │ Network │ News │ Method  │
└───────────────────────────────────────────────────────────────┘
```

---

## 6. Folder structure

```
FIFA_Worldcup_Prediction/
├── PROJECT_GUIDELINE.md
├── README.md
├── backend/
│   ├── requirements.txt
│   ├── data/
│   │   ├── raw/                  # results.csv, shootouts.csv (from Kaggle)
│   │   └── processed/            # features.parquet, elo_ratings.csv
│   ├── pipeline/
│   │   ├── download.py           # fetch dataset (kagglehub or GitHub raw)
│   │   ├── clean.py              # dedupe, normalize team names, filter
│   │   ├── elo.py                # compute rolling Elo ratings
│   │   └── features.py           # build the 25+ features per match
│   ├── models/
│   │   ├── train.py              # train + compare 4 classifiers, save best
│   │   ├── poisson.py            # attack/defense goal model
│   │   └── artifacts/            # saved .joblib models + metrics.json
│   ├── simulate/
│   │   └── monte_carlo.py        # 50,000-run tournament simulation
│   ├── graph/
│   │   └── network.py            # NetworkX: BFS/DFS, centralities, export JSON
│   ├── api/
│   │   ├── main.py               # FastAPI app
│   │   └── schemas.py            # Pydantic models
│   ├── wc2026/
│   │   └── fixtures.json         # teams, groups, results so far, remaining games
│   └── notebooks/
│       └── 01_eda.ipynb          # exploration & charts for the README
└── frontend/
    ├── package.json
    ├── src/
    │   ├── pages/                # Home, Predict, Bracket, Teams, Network, News, Methodology
    │   ├── components/           # MatchCard, ProbBar, BracketTree, GraphView, StatTile...
    │   ├── lib/api.ts            # typed API client
    │   └── styles/
    └── public/
```

---

## 7. Feature engineering (the 25+ features)

Computed **per match, using only data available before that match** (no leakage!):

**Strength & ratings (6)**
1. Elo rating — home team
2. Elo rating — away team
3. Elo difference
4. Poisson attack rating (each team)
5. Poisson defense rating (each team)
6. Rank/rating momentum (Elo change over last 10 matches)

**Recent form (8)**
7–8. Win rate last 5 / last 10 matches (each team)
9–10. Goals scored per match, last 10 (each team)
11–12. Goals conceded per match, last 10 (each team)
13. Current unbeaten streak (each team)
14. Days since last match (rest/rust)

**Head-to-head (4)**
15. H2H win rate (all time)
16. H2H win rate last 10 years
17. H2H average goal difference
18. Number of previous meetings (confidence weight)

**Context (7)**
19. Tournament importance (World Cup > continental > qualifier > friendly)
20. Knockout vs group stage flag
21. Neutral venue flag
22. True home advantage (host nation playing at home)
23. Continental confederation matchup (UEFA vs CONMEBOL etc.)
24. Historical World Cup experience (WC matches played)
25. Month/season of match

**Target**: 3-class outcome — Home Win / Draw / Away Win
(+ the Poisson model separately predicts expected goals for exact scorelines).

---

## 8. Modeling plan

1. **Baselines first**: always-predict-favourite, and Elo-only logistic regression.
2. **Train 4 classifiers** (same as the researched project): Logistic Regression,
   Random Forest, Gradient Boosting, Extra Trees — via a shared scikit-learn pipeline.
3. **Time-based split** (critical — never random split on time-series):
   - Train: 1930 – 2018
   - Validation: 2019 – 2022 (includes WC2022 → great backtest story)
   - Live test: **WC2026 matches as they happen**
4. **Metrics**: accuracy, log-loss, Brier score, per-class F1, calibration curve.
   Report a comparison table in the README and in the app's Methodology page.
5. **Calibrate probabilities** (`CalibratedClassifierCV`) — probabilities are the product.
6. **Poisson scoreline model**: attack/defense strength per team → expected goals →
   scoreline probability matrix → most likely score (e.g. "2–1, 12.4%").
7. **Monte Carlo simulator**: simulate the remaining bracket 50,000× →
   championship probability per team, round-reach probabilities.

---

## 9. Graph network module (the differentiator)

Using **NetworkX** on WC2026 data:

- **Match network**: teams = nodes, scheduled/played matches = edges.
- **Geographic network**: teams connected through shared host cities (16 cities).
- Compute: **degree, betweenness, closeness, eigenvector centrality**, BFS/DFS traversals,
  shortest paths, average hop distance, group-density (12 complete K4 subgraphs).
- Export as JSON → rendered in React with **react-force-graph** (draggable, zoomable,
  node size = centrality, color = confederation).
- Insight cards: "England is the #1 geographic bridge", "Brazil reaches 41/42 teams in 1.73 hops".

---

## 10. FastAPI endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/health` | status + model version |
| `POST /api/predict` `{home, away, knockout, neutral}` | win/draw/loss %, most likely scorelines, key feature values |
| `GET /api/teams` / `GET /api/teams/{name}` | team list / profile: Elo history, form, H2H, WC record |
| `GET /api/simulate` | Monte Carlo output: title odds + round-reach % for all teams |
| `GET /api/bracket` | current WC2026 bracket + model predictions for remaining games |
| `GET /api/network` | graph JSON: nodes (centrality scores) + edges |
| `GET /api/model/metrics` | model comparison table for the Methodology page |
| `GET /api/accuracy` | **live scoreboard**: our predictions vs actual WC2026 results |

---

## 11. Frontend pages & design guideline

**Design language** (from the researched dark-UI projects):
- **Dark immersive theme**: near-black background (`#0a0e17`), glassmorphism cards
  (`rgba(255,255,255,0.05)` + `backdrop-blur`), one **electric accent** (green `#00e676`
  or WC-gold `#ffc107`), red/green probability semantics.
- Smooth micro-animations (Framer Motion): cards fade-up on scroll, probability bars
  animate to value, count-up numbers on stat tiles.
- Fully responsive; football-pitch texture / subtle grid as hero background.

**Pages (7)**
1. **Home / Live Hub** — next fixtures with model predictions, live accuracy scoreboard, title-odds top-5 chart.
2. **Predict** — pick any 2 teams (searchable dropdowns with flags) → animated probability bars + top-5 scorelines heat-grid + "why" (feature contributions).
3. **Bracket Simulator** — interactive WC2026 knockout tree; auto-fill with model picks, or click winners yourself and see title odds re-compute.
4. **Team Analysis** — Elo timeline chart, form guide (last 10 W/D/L chips), H2H comparer, WC history.
5. **Network Explorer** — the force-directed graph + centrality leaderboard + insight cards.
6. **News** — RSS-fed football headlines (stretch goal).
7. **Methodology** — dataset, features, model comparison table, honest limitations. (Recruiters love this page.)

---

## 12. Build phases & timeline (10 phases, ~3–4 weeks part-time)

| Phase | Work | Est. |
|---|---|---|
| 0 | Repo init, folder skeleton, venv, git | 0.5 day |
| 1 | Download + clean dataset, EDA notebook | 1 day |
| 2 | Elo engine + 25 features (leak-free, rolling) | 2–3 days |
| 3 | Train & compare 4 models, calibrate, save artifacts | 2 days |
| 4 | Poisson scoreline model | 1 day |
| 5 | WC2026 fixtures file + Monte Carlo simulator | 1–2 days |
| 6 | NetworkX graph module + JSON export | 1 day |
| 7 | FastAPI (all endpoints, CORS, docs) | 1–2 days |
| 8 | React frontend — all 7 pages | 5–7 days |
| 9 | Deploy (Vercel + Render), README with screenshots, LinkedIn post | 1–2 days |

**Definition of done per phase**: runs end-to-end + committed to git.
Suggested first milestone: after Phase 5 you can already predict the **real upcoming
quarterfinals** (France–Morocco, Spain–Belgium, Norway–England) from the terminal.

---

## 13. Evaluation & the live-validation story

- Backtest table: model vs baselines on 2019–2022 (target: **>55–60% 3-class accuracy**;
  ~50% is the honest ceiling most papers reach — say so in Methodology).
- **Live WC2026 scoreboard**: every remaining match gets a locked-in prediction;
  after each real result, the accuracy page updates. This is your LinkedIn headline.

## 14. Stretch goals (after v1)

- PWA install (manifest + service worker)
- LLM-generated match previews (Claude API) on match cards
- "What-if" group-stage replay simulator
- Player-level data (goalscorers.csv) → top-scorer predictions
- Historical explorer page (filter 49k matches by team/era/tournament)

---

*Guideline v1 — created 2026-07-08. Next step: Phase 0 (project skeleton).*
