(function initAgentDetail() {
  const { byId, setText, setHtml, fmtTime, fetchJson, esc } = window.oc;

  const agentId = document.body.dataset.agentId;

  const statusEl = byId('status');
  const kvsEl = byId('kvs');
  const eventsEl = byId('events');
  const sourcesEl = byId('sources');
  const mdEl = byId('md');

  function kvRow(label, value) {
    return `<div class="muted">${esc(label)}</div><div>${value ?? '—'}</div>`;
  }

  function eventItem(evt) {
    const sev = String(evt.severity || 'info').toLowerCase();
    const cls = sev === 'error' ? 'err' : sev === 'warning' ? 'warn' : 'ok';
    return `
      <div class="item">
        <div class="top">
          <div><span class="dot ${cls}"></span> <b>${esc(evt.title || evt.kind || 'event')}</b></div>
          <div class="muted">${esc(fmtTime(evt.timestamp || evt.occurredAt))}</div>
        </div>
        <div class="meta">${esc(evt.summary || '')}</div>
      </div>
    `;
  }

  function sourceItem(src) {
    const s = String(src.status || 'unknown').toLowerCase();
    const cls = s === 'ok' ? 'ok' : s === 'degraded' ? 'warn' : 'err';
    return `
      <div class="item">
        <div class="top"><div><span class="dot ${cls}"></span> <b>${esc(src.name)}</b></div><div class="muted">${esc(fmtTime(src.collectedAt))}</div></div>
        <div class="meta">${esc(src.message || '')}</div>
      </div>
    `;
  }

  function mdItem(file) {
    const link = '/markdown/' + encodeURIComponent(file.fileId);
    return `
      <div class="item">
        <div class="top"><div><a href="${link}">${esc(file.name)}</a></div><div class="muted">${file.writable ? 'writable' : 'read-only'}</div></div>
        <div class="meta">${esc(file.path)} · updated ${esc(fmtTime(file.updatedAt))}</div>
      </div>
    `;
  }

  (async () => {
    const detail = await fetchJson('/api/v1/agents/' + encodeURIComponent(agentId));
    if (!detail.ok) {
      statusEl.className = 'status err';
      setText(statusEl, `加载失败：${detail.payload?.error?.message || detail.status}`);
      return;
    }

    const data = detail.payload.data;
    statusEl.className = 'status ok';
    setText(
      statusEl,
      `OK · ${data.displayName || data.agentId} · status=${data.status || 'unknown'} · collectedAt=${fmtTime(detail.payload.meta?.collectedAt)}`,
    );

    const issueUrl = data.activeTask?.issueUrl;
    const issueHtml = issueUrl
      ? `<a href="${esc(issueUrl)}" target="_blank" rel="noreferrer">${esc(issueUrl)}</a>`
      : '—';

    setHtml(
      kvsEl,
      [
        kvRow('agentId', esc(data.agentId)),
        kvRow('displayName', esc(data.displayName)),
        kvRow('emoji', esc(data.emoji)),
        kvRow('role', esc(data.role)),
        kvRow('title', esc(data.title)),
        kvRow('status', esc(data.status)),
        kvRow('healthScore', esc(data.healthScore)),
        kvRow('currentModel', esc(data.currentModel)),
        kvRow('currentBranch', esc(data.currentBranch)),
        kvRow('activeTask.title', esc(data.activeTask?.title)),
        kvRow('activeTask.issueUrl', issueHtml),
        kvRow('lastActivityAt', esc(fmtTime(data.lastActivityAt))),
      ].join(''),
    );

    const events = Array.isArray(data.recentEvents) ? data.recentEvents : [];
    setHtml(eventsEl, events.length ? events.map(eventItem).join('') : '<div class="muted">暂无事件</div>');

    const sources = Array.isArray(data.sourceStatus) ? data.sourceStatus : [];
    setHtml(sourcesEl, sources.length ? sources.map(sourceItem).join('') : '<div class="muted">暂无数据源状态</div>');

    const md = await fetchJson('/api/v1/markdown-files');
    if (md.ok) {
      setHtml(mdEl, md.payload.data.map(mdItem).join(''));
    } else {
      setHtml(mdEl, `<div class="status err">加载 markdown allowlist 失败：${esc(md.payload?.error?.message || md.status)}</div>`);
    }
  })();
})();
