"""NetworkX graph analysis of the WC2026 tournament.

Two lenses on one graph export:
  - Match network: teams are nodes, every scheduled/played match is an edge.
  - Centrality suite: degree, betweenness, closeness, eigenvector.

Run:  uv run python -m matchmind.network
"""

from __future__ import annotations

import json

import networkx as nx
import pandas as pd

from .data import ARTIFACTS_DIR, load_teams, load_wc_matches


def build_graph() -> nx.Graph:
    teams = load_teams()
    matches = load_wc_matches()
    G = nx.Graph()
    for t in teams.itertuples():
        G.add_node(t.team_name, group=t.group_letter, confederation=t.confederation,
                   elo=int(t.elo_rating), fifa_rank=int(t.fifa_ranking_pre_tournament),
                   code=t.fifa_code)
    for m in matches.itertuples():
        if pd.isna(m.home_team) or pd.isna(m.away_team):
            continue
        score = (f"{int(m.home_score)}-{int(m.away_score)}"
                 if m.status == "Completed" and not pd.isna(m.home_score) else None)
        G.add_edge(m.home_team, m.away_team, stage=m.stage_name,
                   played=m.status == "Completed", score=score,
                   knockout=bool(m.is_knockout))
    return G


def export() -> dict:
    G = build_graph()
    degree = nx.degree_centrality(G)
    betweenness = nx.betweenness_centrality(G)
    closeness = nx.closeness_centrality(G)
    eigenvector = nx.eigenvector_centrality(G, max_iter=1000)

    nodes = [{
        "id": n, **G.nodes[n],
        "degree": round(degree[n], 4),
        "betweenness": round(betweenness[n], 4),
        "closeness": round(closeness[n], 4),
        "eigenvector": round(eigenvector[n], 4),
        "matches": G.degree[n],
    } for n in G.nodes]

    links = [{"source": u, "target": v, **G.edges[u, v]} for u, v in G.edges]

    # Insight cards
    main = G.subgraph(max(nx.connected_components(G), key=len))
    top_between = max(betweenness, key=betweenness.get)
    top_eigen = max(eigenvector, key=eigenvector.get)
    insights = [
        {"title": "Tournament bridge",
         "text": f"{top_between} has the highest betweenness centrality "
                 f"({betweenness[top_between]:.3f}) — the busiest crossroads of the bracket."},
        {"title": "Strongest neighbourhood",
         "text": f"{top_eigen} tops eigenvector centrality ({eigenvector[top_eigen]:.3f}) — "
                 f"it keeps meeting the tournament's most connected teams."},
        {"title": "Small world",
         "text": f"Average shortest path in the main component: "
                 f"{nx.average_shortest_path_length(main):.2f} hops across "
                 f"{main.number_of_nodes()} teams."},
        {"title": "Group density",
         "text": f"{G.number_of_edges()} matches connect {G.number_of_nodes()} teams — "
                 f"graph density {nx.density(G):.3f}, with 12 complete K4 group cliques."},
    ]
    return {"nodes": nodes, "links": links, "insights": insights}


def main() -> None:
    data = export()
    (ARTIFACTS_DIR / "network.json").write_text(json.dumps(data, indent=2))
    print(f"Graph: {len(data['nodes'])} nodes, {len(data['links'])} edges")
    for i in data["insights"]:
        print(f"  [{i['title']}] {i['text']}")


if __name__ == "__main__":
    main()
