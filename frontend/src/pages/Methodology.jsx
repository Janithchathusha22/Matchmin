import { api, pct } from '../lib/api'
import { ErrorBox, FadeUp, SectionTitle, Spinner, useFetch } from '../components/ui.jsx'

const MODEL_LABELS = {
  baseline_elo_logreg: 'Elo logistic regression (baseline)',
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
  neural_network: 'Neural Network (MLP)',
  weighted_ensemble: 'Validation-weighted ensemble',
}

const FEATURES = [
  ['Strength', 'Elo rating home/away + difference, mapped onto one scale for both data sources'],
  ['Form', 'Win rate, goals for and goals against over each side\'s last five matches (leak-free rolling)'],
  ['Context', 'Knockout vs group flag'],
  ['Scorelines', 'Separate Poisson model: per-team attack/defense strengths → expected goals → full scoreline probability matrix'],
  ['XAI', 'Exact baseline Shapley values decompose each 90-minute home-win probability into local feature contributions'],
]

export default function Methodology() {
  const { data, error, loading } = useFetch(api.metrics)
  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />

  const rows = Object.entries(data.models)

  return (
    <div className="space-y-8">
      <SectionTitle kicker="How it works — honestly" title="Methodology" />

      <div className="grid gap-6 lg:grid-cols-2">
        <FadeUp>
          <div className="glass h-full p-6">
            <h3 className="font-bold text-white">Data & training</h3>
            <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-300">
              <li>• <b className="text-white">{data.n_train_historical} legacy historical internationals</b> train the outcome models; the last 20% is held out for selection.</li>
              <li>• <b className="text-white">{data.n_live_wc2026} completed WC2026 matches</b> are the live test set: the model never trains on them, it is graded by them.</li>
              <li>• Probabilities are <b className="text-white">calibrated</b> (sigmoid, 5-fold) — the product is a probability, not just a pick.</li>
              <li>• Ensemble weights are selected by <b className="text-white">historical validation log-loss</b>. WC2026 labels are reporting-only and cannot choose the model.</li>
              <li>• Monte Carlo simulates the remaining bracket <b className="text-white">200,000×</b>, including explicit extra-time and bounded shootout branches.</li>
            </ul>
          </div>
        </FadeUp>
        <FadeUp delay={0.06}>
          <div className="glass h-full p-6">
            <h3 className="font-bold text-white">Feature groups</h3>
            <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-300">
              {FEATURES.map(([k, v]) => (
                <li key={k}>• <b className="text-white">{k}:</b> {v}</li>
              ))}
            </ul>
          </div>
        </FadeUp>
      </div>

      <FadeUp>
        <div className="glass p-6">
          <SectionTitle kicker="Model comparison" title="Validation chooses; live reality grades" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 pr-4">Model</th>
                  <th className="py-2.5 pr-4">Val accuracy</th>
                  <th className="py-2.5 pr-4">Val log-loss</th>
                  <th className="py-2.5 pr-4">WC2026 accuracy</th>
                  <th className="py-2.5 pr-4">WC2026 log-loss</th>
                  <th className="py-2.5">WC2026 Brier</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([name, m]) => (
                  <tr key={name} className={`border-b border-white/5 last:border-0 ${name === data.best_model ? 'bg-accent/5' : ''}`}>
                    <td className="py-2.5 pr-4 font-semibold text-white">
                      {MODEL_LABELS[name] ?? name}
                      {name === data.best_model && <span className="ml-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">IN PRODUCTION</span>}
                    </td>
                    <td className="tabular py-2.5 pr-4 text-slate-300">{pct(m.validation.accuracy, 1)}</td>
                    <td className="tabular py-2.5 pr-4 text-slate-300">{m.validation.log_loss}</td>
                    <td className="tabular py-2.5 pr-4 font-semibold text-white">{pct(m.wc2026_live.accuracy, 1)}</td>
                    <td className="tabular py-2.5 pr-4 text-slate-300">{m.wc2026_live.log_loss}</td>
                    <td className="tabular py-2.5 text-slate-300">{m.wc2026_live.brier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </FadeUp>

      <FadeUp>
        <div className="glass border-gold/20 p-6">
          <h3 className="font-bold text-gold">Honest limitations</h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-300">
            <li>• Football is low-scoring and noisy: ~50–60% three-class accuracy is near the ceiling most published models reach. Draws are the hardest class.</li>
            <li>• The legacy 600-match file has no dates or source lineage. Its file order is only a temporary split until a verified dated archive replaces it.</li>
            <li>• Validation currently gives the Elo-logistic component almost all ensemble weight. Other models remain visible as disagreement signals instead of being forced into the forecast.</li>
            <li>• Extra time uses one-third scoring intensity; shootout probabilities are intentionally bounded to 40–60% because Elo is only a weak penalty proxy.</li>
            <li>• Elo ratings are frozen pre-tournament; a team that grew during the cup is only captured through the form features.</li>
          </ul>
        </div>
      </FadeUp>
    </div>
  )
}
