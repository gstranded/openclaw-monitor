(function initMarkdownEditor() {
  const { byId, setText, fmtTime, fetchJson, statusClass } = window.oc;

  const fileId = document.body.dataset.fileId;

  const statusEl = byId('status');
  const metaEl = byId('meta');
  const contentEl = byId('content');
  const diffEl = byId('diff');
  const previewBtn = byId('preview');
  const saveBtn = byId('save');

  let originalContent = '';

  function setStatus(level, text) {
    statusEl.className = 'status ' + statusClass(level);
    setText(statusEl, text);
  }

  function explainError(payload) {
    const err = payload?.error;
    if (!err) return '未知错误';
    return `${err.code || 'ERROR'}: ${err.message || ''}`;
  }

  async function load() {
    setStatus('ok', '加载中…');
    const res = await fetchJson('/api/v1/markdown-files/' + encodeURIComponent(fileId));
    if (!res.ok) {
      setStatus('error', '加载失败：' + explainError(res.payload));
      diffEl.textContent = JSON.stringify(res.payload, null, 2);
      return;
    }
    originalContent = res.payload.data.content;
    contentEl.value = originalContent;
    metaEl.textContent = `updatedAt=${fmtTime(res.payload.data.updatedAt)} · bytes=${res.payload.data.bytes}`;
    setStatus('ok', 'OK · 已加载');
    diffEl.textContent = '(preview to see diff)';
  }

  previewBtn.addEventListener('click', async () => {
    const next = contentEl.value;
    const res = await fetchJson('/api/v1/markdown-files/preview-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, content: next }),
    });
    if (!res.ok) {
      setStatus('error', '预览失败：' + explainError(res.payload));
      diffEl.textContent = JSON.stringify(res.payload, null, 2);
      return;
    }
    setStatus('ok', res.payload.data.changed ? 'OK · 有变更（可保存）' : 'OK · 无变更');
    diffEl.textContent = res.payload.data.diff;
  });

  saveBtn.addEventListener('click', async () => {
    const next = contentEl.value;
    const res = await fetchJson('/api/v1/markdown-files/' + encodeURIComponent(fileId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: next, expectedContent: originalContent }),
    });
    if (!res.ok) {
      setStatus('error', '保存失败：' + explainError(res.payload));
      diffEl.textContent = JSON.stringify(res.payload, null, 2);
      return;
    }
    originalContent = next;
    setStatus('ok', res.payload.data.changed ? 'OK · 已保存（有变更）' : 'OK · 已保存（无变更）');
    diffEl.textContent = res.payload.data.diff;
    metaEl.textContent = `updatedAt=${fmtTime(res.payload.data.updatedAt)} · bytes=${res.payload.data.bytes}`;
  });

  load();
})();
