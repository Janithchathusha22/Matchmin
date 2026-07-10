import { useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { api, CONFED_COLORS } from '../lib/api'
import { ErrorBox, FadeUp, SectionTitle, Spinner, useFetch } from '../components/ui.jsx'

const CONFEDS = Object.keys(CONFED_COLORS)
const HEX = {
  UEFA: '#3987e5', CONMEBOL: '#199e70', CONCACAF: '#c98500',
  CAF: '#008300', AFC: '#9085e9', OFC: '#e66767',
}

export default function Network() {
  const { data, error, loading } = useFetch(api.network)
  const [metric, setMetric] = useState('betweenness')
  const wrapRef = useRef(null)

  const graphData = useMemo(() => {
    if (!data) return null
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({ ...l })),
    }
  }, [data])

  if (loading) return <Spinner label="Computing centralities…" />
  if (error) return <ErrorBox error={error} />

  const leaderboard = [...data.nodes].sort((a, b) => b[metric] - a[metric]).slice(0, 10)

  return (
    <div className="space-y-8">
      <SectionTitle kicker="Graph theory on WC2026" title="Tournament network explorer"
        right={<span className="text-xs text-slate-500">48 teams · every match is an edge · drag, zoom, hover</span>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <FadeUp className="lg:col-span-2">
          <div ref={wrapRef} className="glass relative overflow-hidden" style={{ height: 560 }}>
            <ForceGraph2D
              graphData={graphData}
              width={wrapRef.current?.clientWidth ?? 780}
              height={560}
              backgroundColor="rgba(0,0,0,0)"
              nodeLabel={(n) =>
                `<div style="text-align:center"><b>${n.id}</b><br/>${n.confederation} · Group ${n.group}<br/>` +
                `betweenness ${n.betweenness} · eigenvector ${n.eigenvector}<br/>matches ${n.matches}</div>`}
              nodeVal={(n) => 4 + n.betweenness * 120}
              nodeCanvasObjectMode={() => 'after'}
              nodeCanvasObject={(n, ctx, scale) => {
                if (scale < 1.15 && n.betweenness < 0.05) return
                ctx.font = `${11 / scale}px Segoe UI`
                ctx.textAlign = 'center'
                ctx.fillStyle = 'rgba(232,236,244,0.9)'
                ctx.fillText(n.code, n.x, n.y - (6 + n.betweenness * 40) / Math.sqrt(scale))
              }}
              nodeColor={(n) => HEX[n.confederation] ?? '#7a8699'}
              linkColor={(l) => (l.played ? 'rgba(255,255,255,0.22)' : 'rgba(0,230,118,0.45)')}
              linkWidth={(l) => (l.knockout ? 1.8 : 0.7)}
              linkLabel={(l) => `${l.source.id ?? l.source} – ${l.target.id ?? l.target}<br/>${l.stage}${l.score ? ` · ${l.score}` : ' · upcoming'}`}
              cooldownTicks={120}
            />
            <div className="glass-inset absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-[11px]">
              {CONFEDS.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-slate-300">
                  <span className="size-2.5 rounded-full" style={{ background: HEX[c] }} /> {c}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="inline-block h-0.5 w-4 bg-accent/70" /> upcoming match
              </span>
            </div>
          </div>
        </FadeUp>

        <FadeUp delay={0.08}>
          <div className="glass h-full p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-white">Centrality leaderboard</h3>
              <select value={metric} onChange={(e) => setMetric(e.target.value)}
                className="glass-inset px-2 py-1.5 text-xs text-white outline-none">
                <option value="betweenness">betweenness</option>
                <option value="eigenvector">eigenvector</option>
                <option value="closeness">closeness</option>
                <option value="degree">degree</option>
              </select>
            </div>
            <ol className="space-y-1.5">
              {leaderboard.map((n, i) => (
                <li key={n.id} className="glass-inset flex items-center gap-2.5 px-3 py-2 text-sm">
                  <span className="tabular w-5 text-right text-xs font-bold text-slate-500">{i + 1}</span>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: HEX[n.confederation] }} />
                  <span className="flex-1 truncate font-semibold text-slate-200">{n.id}</span>
                  <span className="tabular text-xs font-bold text-white">{n[metric].toFixed(3)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Betweenness = how often a team sits on the shortest path between two others —
              the bracket's crossroads. Node size follows it.
            </p>
          </div>
        </FadeUp>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.insights.map((ins, i) => (
          <FadeUp key={ins.title} delay={i * 0.06}>
            <div className="glass glass-hover h-full p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">{ins.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{ins.text}</p>
            </div>
          </FadeUp>
        ))}
      </div>
    </div>
  )
}
