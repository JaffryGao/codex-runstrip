/* Codex 底部状态条 —— 通过 CDP 注入的浮层实现，不修改任何 React 管理的 DOM 结构 */
(() => {
  if (window.__codexFooter?.installed) return 'already installed';
  const ID = '__codex_footer__';

  const css = `
  #${ID}{position:fixed;z-index:2147483000;display:flex;align-items:center;justify-content:center;
    gap:20px;height:22px;font:11.5px/16px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;
    color:var(--color-text-secondary,#8a8f98);letter-spacing:.1px;user-select:none;
    opacity:0;transition:opacity .18s ease;pointer-events:none}
  #${ID}.ready{opacity:1}
  #${ID} .cf-item{pointer-events:auto;cursor:pointer;display:inline-flex;align-items:center;gap:6px;
    padding:1px 6px;border-radius:6px;white-space:nowrap}
  #${ID} .cf-item:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
  #${ID} .cf-item[data-active="1"]{background:color-mix(in srgb,currentColor 14%,transparent)}
  #${ID} .cf-pop{position:fixed;z-index:2147483001;min-width:260px;padding:12px 14px;
    border-radius:12px;background:var(--color-bg-elevated,#fff);color:var(--color-text-primary,#111);
    border:1px solid color-mix(in srgb,currentColor 14%,transparent);
    box-shadow:0 10px 34px rgba(0,0,0,.14),0 2px 6px rgba(0,0,0,.06);
    font:12px/20px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;display:none}
  #${ID} .cf-pop.show{display:block}
  #${ID} .cf-pop h4{margin:0 0 8px;font-size:12.5px;font-weight:600;display:flex;justify-content:space-between;gap:16px}
  #${ID} .cf-pop .row{display:flex;justify-content:space-between;gap:24px;color:var(--color-text-secondary,#666)}
  #${ID} .cf-pop .row b{color:var(--color-text-primary,#111);font-weight:500;font-variant-numeric:tabular-nums}
  #${ID} .cf-pop hr{border:none;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);margin:8px 0}
  #${ID} .cf-bar{height:4px;border-radius:99px;background:color-mix(in srgb,currentColor 16%,transparent);overflow:hidden;margin:8px 0 10px;display:flex;gap:1px}
  #${ID} .cf-bar i{display:block;height:100%}
  @media (prefers-color-scheme: dark){
    #${ID} .cf-pop{background:#26262a;border-color:rgba(255,255,255,.12)}
  }`;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = ID;
  root.innerHTML = `
    <div class="cf-item" data-pop="turn"><span data-k="turn"></span></div>
    <div class="cf-item" data-pop="tok"><span data-k="tok"></span></div>
    <div class="cf-item" data-pop="ctx"><span data-k="ctx"></span></div>`;
  document.body.appendChild(root);

  const fmt = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? Math.round(n/1e3)+'K' : String(n|0);

  function popEl(key) {
    let p = root.querySelector(`.cf-pop[data-for="${key}"]`);
    if (!p) {
      p = document.createElement('div');
      p.className = 'cf-pop';
      p.dataset.for = key;
      root.appendChild(p);
    }
    return p;
  }

  function composerRect() {
    // 取屏幕最靠下的那个输入区（项目选择器也带同样属性，不能只按宽度挑）
    const cands = [...document.querySelectorAll('[data-composer-footer-responsive], [class*="ComposerLayoutRoot"]')]
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(o => o.r.height > 40 && o.r.width > 300 && o.r.bottom <= innerHeight + 1)
      .sort((x, y) => y.r.bottom - x.r.bottom || y.r.width - x.r.width);
    if (!cands.length) return null;
    const card = cands[0].el.closest('[class*="ComposerLayoutRoot"]') || cands[0].el;
    return card.getBoundingClientRect();
  }

  let lastRect = '';
  function place() {
    const r = composerRect();
    if (!r) { root.classList.remove('ready'); return; }
    const key = [r.left, r.bottom, r.width].map(Math.round).join(',');
    if (key !== lastRect) {
      lastRect = key;
      root.style.left = Math.round(r.left) + 'px';
      root.style.width = Math.round(r.width) + 'px';
      // 输入框贴底时自动上移，避免被窗口下沿裁掉
      root.style.top = Math.round(Math.min(r.bottom + 4, innerHeight - 22)) + 'px';
    }
    root.classList.add('ready');
  }
  place();
  setInterval(place, 300);
  window.addEventListener('resize', place);
  new MutationObserver(place).observe(document.documentElement, { childList: true, subtree: true });

  // 弹层
  let active = null;
  function close() {
    root.querySelectorAll('.cf-pop').forEach(p => p.classList.remove('show'));
    root.querySelectorAll('.cf-item').forEach(i => i.dataset.active = '0');
    active = null;
  }
  root.querySelectorAll('.cf-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = item.dataset.pop;
      if (active === key) return close();
      close();
      const p = popEl(key);
      p.classList.add('show');
      item.dataset.active = '1';
      active = key;
      const ir = item.getBoundingClientRect();
      p.style.left = Math.max(8, Math.min(ir.left - 24, innerWidth - p.offsetWidth - 12)) + 'px';
      p.style.top = (ir.top - p.offsetHeight - 8) + 'px';
    });
  });
  document.addEventListener('click', close, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  window.__codexFooter = {
    installed: true,
    update(s) {
      const q = (k) => root.querySelector(`[data-k="${k}"]`);
      q('turn').textContent = `↻ ${s.turns} 轮 ${s.steps} 步 · ${Math.round(s.tps)} tok/s`;
      q('tok').textContent = `▤ ${fmt(s.total_tokens)} tok · 缓存命中 ${Math.round(s.cache_rate)}%`;
      q('ctx').textContent = `◔ ${Math.round(s.context_pct)}%`;

      popEl('turn').innerHTML = `
        <h4><span>会话统计</span><span>${s.turns} 轮</span></h4>
        <div class="row"><span>工具调用步数</span><b>${s.steps}</b></div>
        <div class="row"><span>模型用时</span><b>${s.model_seconds.toFixed(1)} 秒</b></div>
        <div class="row"><span>输出速度 (TPS)</span><b>${Math.round(s.tps)} tok/s</b></div>
        <div class="row"><span>输出 token</span><b>${fmt(s.output)}</b></div>`;

      popEl('tok').innerHTML = `
        <h4><span>Token 用量</span><span>${fmt(s.total_tokens)} tok</span></h4>
        <div class="row"><span>缓存命中</span><b>${Math.round(s.cache_rate)}%</b></div>
        <div class="row"><span>缓存读取</span><b>${fmt(s.cached)}</b></div>
        <div class="row"><span>未缓存输入</span><b>${fmt(Math.max(0, s.input - s.cached))}</b></div>
        <div class="row"><span>输出</span><b>${fmt(s.output)}</b></div>`;

      const pct = Math.min(100, s.context_pct);
      popEl('ctx').innerHTML = `
        <h4><span>上下文已用 ${Math.round(pct)}%</span><span>${fmt(s.context_used)} / ${fmt(s.context_window)}</span></h4>
        <div class="cf-bar">
          <i style="width:${Math.min(pct, 4)}%;background:#8b5cf6"></i>
          <i style="width:${Math.min(pct, 6)}%;background:#6366f1"></i>
          <i style="width:${Math.max(0, pct - 10)}%;background:#3b82f6"></i>
        </div>
        <div class="row"><span>系统提示词</span><b>~${fmt(s.ctx_breakdown.system)}</b></div>
        <div class="row"><span>工具定义</span><b>~${fmt(s.ctx_breakdown.tools)}</b></div>
        <div class="row"><span>对话消息</span><b>~${fmt(s.ctx_breakdown.messages)}</b></div>`;

      // 重新定位打开中的弹层
      if (active) {
        const item = root.querySelector(`.cf-item[data-pop="${active}"]`);
        const p = popEl(active);
        const ir = item.getBoundingClientRect();
        p.style.left = Math.max(8, Math.min(ir.left - 24, innerWidth - p.offsetWidth - 12)) + 'px';
        p.style.top = (ir.top - p.offsetHeight - 8) + 'px';
      }
    },
    destroy() { root.remove(); style.remove(); root.querySelectorAll('.cf-pop').forEach(p=>p.remove()); document.removeEventListener('click', close, true); window.__codexFooter = undefined; }
  };
  return 'installed';
})();
