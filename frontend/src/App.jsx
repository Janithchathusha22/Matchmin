import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Verdict from './pages/Verdict.jsx'
import Predict from './pages/Predict.jsx'
import Bracket from './pages/Bracket.jsx'
import Teams from './pages/Teams.jsx'
import Network from './pages/Network.jsx'
import Methodology from './pages/Methodology.jsx'

const NAV = [
  ['/', 'Home'],
  ['/verdict', 'Verdict'],
  ['/predict', 'Predict'],
  ['/bracket', 'Bracket'],
  ['/teams', 'Teams'],
  ['/network', 'Network'],
  ['/methodology', 'Method'],
]

const BrandMark = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 28 28" fill="none">
      <path d="M14 3.5 22 8v9l-8 4.5L6 17V8l8-4.5Z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="12.5" r="3.1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 9.4V3.8M11.4 14.1 6.2 17m10.4-2.9 5.2 2.9" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  </span>
)

export default function App() {
  return (
    <div className="mx-auto min-h-screen max-w-[1400px] px-3 pb-12 sm:px-6 lg:px-8">
      <header className="sticky top-3 z-50 mt-3">
        <nav className="site-nav glass-shine flex items-center gap-2 px-3 py-2 sm:px-4">
          <NavLink to="/" className="mr-1 flex shrink-0 items-center gap-2.5 text-lg font-black tracking-[-.035em] text-white sm:mr-4">
            <BrandMark />
            <span className="hidden sm:inline">Match<span className="text-accent">Mind</span></span>
          </NavLink>
          <div className="flex flex-1 items-center gap-0.5 overflow-x-auto py-0.5">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors sm:px-3 sm:text-[13px] ${
                    isActive
                      ? 'bg-white/[.08] text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
          <NavLink to="/predict" className="nav-predict hidden shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-black lg:flex">
            Make a prediction <span aria-hidden="true">↗</span>
          </NavLink>
        </nav>
      </header>

      <main className="mt-6 sm:mt-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/verdict" element={<Verdict />} />
          <Route path="/predict" element={<Predict />} />
          <Route path="/bracket" element={<Bracket />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/network" element={<Network />} />
          <Route path="/methodology" element={<Methodology />} />
        </Routes>
      </main>

      <footer className="mt-24 flex flex-col gap-4 border-t border-white/[.07] py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 font-bold text-slate-300"><BrandMark /> MatchMind</div>
        <p>FIFA World Cup 2026 · Probabilistic intelligence, built to be inspected.</p>
        <p className="text-slate-600">200,000 paths · One trophy</p>
      </footer>
    </div>
  )
}
