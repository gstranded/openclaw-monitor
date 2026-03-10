(function initMarkdownList() {
  const { byId, setText, setHtml, fmtTime, fetchJson, esc } = window.oc;

  const statusEl = byId('status');
  const listEl = byId('list');

  function mdItem(file) {
    const link = '/markdown/' + encodeURIComponent(file.fileId);
    return `
      <div class="item">
        <div class="top"><div><a href="${link}">${esc(file.name)}</a></div><div class="muted">${esc(Math.round((file.sizeBytes || 0) / 1024))} KB</div></div>
        <div class="meta">${esc(file.path)} · updated ${esc(fmtTime(file.updatedAt))} · ${file.writable ? 'writable' : 'read-only'}</div>
      </div>
    `;
  }

  (async () => {
    const md = await fetchJson('/api/v1/markdown-files');
    if (!md.ok) {
      statusEl.className = 'status err';
      setText(statusEl, `加载失败：${md.payload?.error?.message || md.status}`);
      setHtml(listEl, '');
      return;
    }

    statusEl.className = 'status ok';
    setText(
      statusEl,
      `OK · allowlistCount=${md.payload.meta?.allowlistCount ?? md.payload.data.length} · collectedAt=${fmtTime(md.payload.meta?.collectedAt)}`,
    );
    setHtml(listEl, md.payload.data.map(mdItem).join(''));
  })();
})();
