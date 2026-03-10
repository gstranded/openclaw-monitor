(function initDashboard() {
  const { byId, setHtml, fmtTime, fetchJson, esc } = window.oc;

  const agentsEl = byId('agents');
  const leaderboardEl = byId('leaderboard');
  const mdEl = byId('mdFiles');

  function dotForStatus(status) {
    const s = String(status || 'unknown').toLowerCase();
    if (s === 'active' || s === 'healthy') return 'ok';
    if (s === 'degraded' || s === 'blocked') return 'warn';
    if (s === 'offline') return 'err';
    return '';
  }

  function agentCard(agent) {
    const link = '/agents/' + encodeURIComponent(agent.agentId);
    const dot = dotForStatus(agent.status);
    const name = (agent.emoji ? agent.emoji + ' ' : '') + (agent.displayName || agent.agentId);
    const role = agent.role || '—';
    const title = agent.title || '';
    const status = agent.status || 'unknown';
    const score = agent.healthScore ?? '—';
    return `
      <a class="card" href="${link}">
        <div class="name"><span class="dot ${dot}"></span>${esc(name)}</div>
        <div class="sub">${esc(role)} · ${esc(title)}</div>
        <div class="sub">状态：${esc(status)} · healthScore：${esc(score)} · 最近：${esc(fmtTime(agent.lastActivityAt))}</div>
      </a>
    `;
  }

  function leaderboardItem(item) {
    const link = '/agents/' + encodeURIComponent(item.agentId);
    return `
      <div class="item">
        <div class="top">
          <div><b>#${esc(item.rank)}</b> <a href="${link}">${esc(item.displayName || item.agentId)}</a> <span class="muted">(${esc(item.role || '—')})</span></div>
          <div class="pill"><span class="dot"></span>score ${esc(item.leaderboardScore ?? '—')}</div>
        </div>
        <div class="meta">24h throughput: ${esc(item.throughput24h ?? '—')} · stability: ${esc(item.stabilityScore ?? '—')} · last: ${esc(fmtTime(item.lastActivityAt))}</div>
      </div>
    `;
  }

  function markdownItem(file) {
    const link = '/markdown/' + encodeURIComponent(file.fileId);
    return `
      <div class="item">
        <div class="top"><div><a href="${link}">${esc(file.name)}</a></div><div class="muted">${esc(Math.round((file.sizeBytes || 0) / 1024))} KB</div></div>
        <div class="meta">path: ${esc(file.path)} · updated: ${esc(fmtTime(file.updatedAt))}</div>
      </div>
    `;
  }

  (async () => {
    const agents = await fetchJson('/api/v1/agents?limit=50');
    if (!agents.ok) {
      setHtml(agentsEl, `<div class="status err">加载失败：${esc(agents.payload?.error?.message || agents.status)}</div>`);
    } else {
      setHtml(agentsEl, agents.payload.data.map(agentCard).join(''));
    }

    const leaderboard = await fetchJson('/api/v1/leaderboard?window=24h&sortBy=score&limit=20');
    if (!leaderboard.ok) {
      setHtml(leaderboardEl, `<div class="status err">加载失败：${esc(leaderboard.payload?.error?.message || leaderboard.status)}</div>`);
    } else {
      setHtml(leaderboardEl, leaderboard.payload.data.map(leaderboardItem).join(''));
    }

    const md = await fetchJson('/api/v1/markdown-files');
    if (!md.ok) {
      setHtml(mdEl, `<div class="status err">加载失败：${esc(md.payload?.error?.message || md.status)}</div>`);
    } else {
      setHtml(mdEl, md.payload.data.map(markdownItem).join(''));
    }
  })();
})();
