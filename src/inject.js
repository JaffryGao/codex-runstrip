/* 独立浮层，不改写 React 管理的节点。 */
(() => {
  const VERSION = 'thread-metrics-v1';
  const ID = '__codex_footer__';
  if (window.__codexFooter?.version === VERSION && document.getElementById(ID)) return 'already installed';
  window.__codexFooter?.destroy();
  if (!document.body || !window.__RunstripSpeed || !window.__RunstripBinding) return 'not ready';

  const tracker = new window.__RunstripSpeed.SpeedTracker({ countTokens: window.__RunstripTokenizer?.count });
  const style = document.createElement('style');
  style.textContent = `
    #${ID}{--rs-green:#397b22;--rs-amber:#966217;--rs-bg:#fff;--rs-fg:#222;
      position:fixed;z-index:2147483000;display:flex;align-items:center;justify-content:center;
      gap:8px;height:22px;color:var(--color-text-secondary,#85858d);
      font:11.5px/16px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      font-variant-numeric:tabular-nums;user-select:none;visibility:hidden;pointer-events:none}
    #${ID}.ready{visibility:visible}
    #${ID} button{appearance:none;border:0;background:none;color:inherit;font:inherit;
      display:inline-flex;align-items:center;gap:5px;padding:2px 4px;margin:0;border-radius:4px;
      white-space:nowrap;cursor:pointer;pointer-events:auto;flex-shrink:0}
    #${ID} button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    #${ID} button:active{transform:scale(.98)}
    #${ID} button[aria-expanded=true]{background:color-mix(in srgb,currentColor 12%,transparent)}
    #${ID} .rs-speed{font-family:"SF Mono",Menlo,monospace;display:grid;
      grid-template-columns:12px 7px 68px 86px 128px;gap:5px;box-sizing:border-box;width:329px}
    #${ID} .rs-plug{width:12px;height:12px;opacity:.7;flex-shrink:0}
    #${ID} .rs-spinner{width:7px;height:7px;border:1.5px solid currentColor;border-right-color:transparent;
      border-radius:50%;opacity:.65;flex-shrink:0;visibility:hidden}
    #${ID}[data-flowing=true] .rs-spinner{visibility:visible}
    #${ID} .rs-visual{display:flex;align-items:center;width:68px;height:12px;position:relative}
    #${ID} .rs-gauge{width:100%;height:10px;
      background:radial-gradient(circle,currentColor 1px,transparent 1.5px) 0 50%/6px 4px repeat-x;overflow:hidden}
    #${ID} .rs-fill{display:block;width:0;height:100%;background:var(--rs-bar,#85858d)}
    #${ID} .rs-rate{text-align:right;white-space:nowrap}
    #${ID} .rs-percentiles{display:inline-flex;justify-content:space-between;width:128px}
    #${ID} .rs-percentiles[hidden]{display:inline-flex;visibility:hidden}
    #${ID} .rs-percentiles em{font-style:normal;opacity:.65;margin-right:3px}
    #${ID} .rs-percentiles b{font-weight:500}
    #${ID} .rs-counts{box-sizing:border-box;width:112px;justify-content:center}
    #${ID} .rs-counts span{overflow:hidden;text-overflow:ellipsis}
    #${ID} .rs-usage{display:grid;grid-template-columns:86px 82px;box-sizing:border-box;width:181px;text-align:left}
    #${ID} .rs-context{box-sizing:border-box;width:66px;justify-content:flex-start}
    #${ID}[data-tone=green] .rs-speed{color:var(--rs-green);--rs-bar:var(--rs-green)}
    #${ID}[data-tone=amber] .rs-speed{color:var(--rs-amber);--rs-bar:var(--rs-amber)}
    #${ID}.compact{gap:4px;font-size:11px}
    #${ID}.compact .rs-speed{grid-template-columns:12px 7px 48px 80px 116px;width:291px}
    #${ID}.compact .rs-visual{width:48px}
    #${ID}.compact .rs-percentiles{width:116px}
    #${ID}.compact .rs-counts{width:108px}
    #${ID}.compact .rs-usage{grid-template-columns:74px 60px;width:147px}
    #${ID}.narrow .rs-usage{display:none}
    #${ID}.minimal .rs-usage,#${ID}.minimal .rs-context{display:none}
    #${ID}.minimal .rs-speed{font-size:10.5px;grid-template-columns:10px 6px 42px 74px 112px;gap:4px;width:268px}
    #${ID}.minimal .rs-visual{display:flex;width:42px}
    #${ID}.minimal .rs-percentiles{width:112px}
    #${ID}.tiny .rs-counts{display:none}
    #${ID} .rs-pop{display:none;position:fixed;box-sizing:border-box;pointer-events:auto;
      width:320px;max-width:calc(100vw - 24px);max-height:calc(100vh - 32px);overflow:auto;
      padding:12px 14px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);
      border-radius:10px;background:var(--color-bg-elevated,var(--rs-bg));color:var(--color-text-primary,var(--rs-fg));
      box-shadow:0 6px 24px #0002;font:12px/20px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
    #${ID} .rs-pop.open{display:block}
    #${ID} .rs-pop h4{margin:0 0 8px;font-size:12px;font-weight:600}
    #${ID} .rs-row{display:flex;justify-content:space-between;gap:12px}
    #${ID} .rs-row span{opacity:.7}
    #${ID} .rs-row b{font-weight:500;text-align:right;overflow-wrap:anywhere;max-width:65%}
    #${ID} .rs-note{margin:8px 0 0;padding-top:8px;border-top:1px solid #8883;opacity:.7;font-size:11px;line-height:17px}
    @media (hover:hover) and (pointer:fine){#${ID} button:hover{background:color-mix(in srgb,currentColor 10%,transparent)}}
    @media (prefers-color-scheme:dark){#${ID}{--rs-green:#a1ce70;--rs-amber:#d9ae62;--rs-bg:#26262a;--rs-fg:#eee}}
    :root[data-theme=dark] #${ID},:root.dark #${ID}{--rs-green:#a1ce70;--rs-amber:#d9ae62;--rs-bg:#26262a;--rs-fg:#eee}
    :root[data-theme=light] #${ID},:root.light #${ID}{--rs-green:#397b22;--rs-amber:#966217;--rs-bg:#fff;--rs-fg:#222}
    @media (prefers-reduced-motion:reduce){#${ID} .rs-spinner{transform:none!important}}
  `;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = ID;
  root.dataset.version = VERSION;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Runstrip 会话状态');
  root.innerHTML = `
    <button type="button" class="rs-speed" data-pop="speed" aria-label="输出速度与分位数" aria-expanded="false" aria-controls="${ID}-speed">
      <svg class="rs-plug" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m4 1 3 3M10 7l3 3M2 6l4-4 6 6-4 4zM10 10l4 4"/></svg>
      <span class="rs-spinner" aria-hidden="true"></span>
      <span class="rs-visual" aria-hidden="true"><span class="rs-gauge"><i class="rs-fill"></i></span></span>
      <span class="rs-rate">— tok/s</span>
      <span class="rs-percentiles" hidden aria-hidden="true"><span><em>P50</em><b data-k="p50"></b></span><span><em>P95</em><b data-k="p95"></b></span></span>
    </button>
    <button type="button" class="rs-counts" data-pop="counts" aria-label="聊天轮次与工具步数" aria-expanded="false" aria-controls="${ID}-counts"><span data-k="counts">↻ 待统计</span></button>
    <button type="button" class="rs-usage" data-pop="usage" aria-label="Token 用量" aria-expanded="false" aria-controls="${ID}-usage"><span data-k="tokens">▤ 待统计</span><span class="rs-cache" data-k="cache">缓存 待统计</span></button>
    <button type="button" class="rs-context" data-pop="context" aria-label="上下文用量" aria-expanded="false" aria-controls="${ID}-context"><span data-k="context">◔ 待统计</span></button>
  `;
  document.body.appendChild(root);
  const q = selector => root.querySelector(selector);
  const fmt = n => !Number.isFinite(n) ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;
  const rate = n => Number.isFinite(n) ? fmt(n) : '—';
  const { sameSelection: same, acceptsStats } = window.__RunstripSpeed;
  let selected = null, stats = null, active = null, disposed = false, frame = 0;
  let latestSpeed = tracker.snapshot(null);
  let lastDetail = '';
  let bindingState = { selection: null, source: null, reason: 'unavailable' };

  function selection() {
    bindingState = window.__RunstripBinding.resolve(document, tracker.contexts());
    return bindingState.selection;
  }
  function syncSelection() {
    const next = selection();
    if (!same(selected, next)) {
      selected = next;
      stats = null;
      close();
      return true;
    }
    return false;
  }
  function popEl(key) {
    let pop = document.getElementById(`${ID}-${key}`);
    if (!pop) {
      pop = document.createElement('div');
      pop.id = `${ID}-${key}`;
      pop.className = 'rs-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', { speed: '输出速度详情', counts: '聊天轮次与工具步数', usage: 'Token 用量详情', context: '上下文详情' }[key]);
      pop.tabIndex = -1;
      root.appendChild(pop);
    }
    return pop;
  }
  function close(restoreFocus = false) {
    if (restoreFocus && active) q(`[data-pop="${active}"]`)?.focus({ preventScroll: true });
    root.querySelectorAll('.rs-pop').forEach(p => p.classList.remove('open'));
    root.querySelectorAll('button').forEach(b => b.setAttribute('aria-expanded', 'false'));
    active = null;
    lastDetail = '';
  }
  function positionPop() {
    if (!active) return;
    const pop = popEl(active), rect = q(`[data-pop="${active}"]`).getBoundingClientRect();
    pop.style.left = `${Math.max(12, Math.min(rect.left - 12, innerWidth - pop.offsetWidth - 12))}px`;
    pop.style.top = `${Math.max(12, rect.top - pop.offsetHeight - 8)}px`;
  }
  function details() {
    if (!active) return;
    const s = latestSpeed;
    const title = { speed: '本轮 Token 流速', counts: '轮次与步数 · 当前聊天', usage: 'Token 用量 · 当前聊天', context: '上下文 · 最近已结算请求' }[active];
    let rows, note;
    if (active === 'speed') {
      rows = [
        ['最近 2 秒输出窗', Number.isFinite(s.tps) ? `≈${rate(s.tps)} tok/s` : '尚无有效采样'],
        ['本轮 P50 / P95', s.stream?.count ? `≈${rate(s.stream.p50)} / ≈${rate(s.stream.p95)} tok/s` : '样本不足'],
        ['本轮有效采样窗', s.stream?.count || 0],
        ['本轮观测 Token', s.stream?.tokens != null ? `≈${fmt(s.stream.tokens)}` : '未采样'],
        ['聊天轮次 / 工具步数', stats ? `${stats.turns} / ${stats.steps}` : '待统计'],
        ['实际输出 Token', fmt(s.last?.outputTokens)],
        ['其中思考 Token', fmt(s.last?.reasoningOutputTokens)],
        ['响应输出窗口', Number.isFinite(s.last?.durationMs) ? `${(s.last.durationMs / 1000).toFixed(2)} 秒` : '计时不可用'],
        ['实际响应均速', `${rate(s.actual?.tps)} tok/s`],
        ['历史实际 P50 / P95', `${rate(s.p50)} / ${rate(s.p95)} tok/s`],
        ['历史有效 / 未计速响应', `${s.count} / ${s.omitted}`],
        ['配置模型', s.model === 'unknown' ? '尚未识别' : s.model],
      ];
      note = '主条使用本机 o200k_base 对可观测 Token 流计数，≈ 表示近似且不含隐藏思考。流速取最近约 2 秒，首块作基线，至少采样 1 秒；无输出时冻结，超过 2 秒停顿重新采样。主条 P50/P95 取本轮最近 500 个约 1 秒有效输出窗，轮次结束后显示；不足 1 秒的尾窗不计入。实际响应均速及历史分位数单独按服务端用量计算，包含隐藏思考，不替换主条数值。';
      if (!s.tokenizerAvailable) note += ' 本机分词器或计数不可用时不显示实时数值，不以字符估算代替。';
      if (!s.stream) note += ' 此轮未保留流式采样，仅有实际结算用量。';
      if (s.partial) note += ' 本段从状态栏接入时开始观测。';
      if (s.last?.reason) {
        const reasons = {
          missing_start: '缺少模型输出起点', missing_usage: '缺少有效输出 Token',
          missing_response: '缺少响应标识', missing_model: '模型未识别',
          invalid_time: '时间边界不完整或乱序', turn_mismatch: '轮次边界不完整',
          interrupted: '窗口内发生中断或错误', compacted: '窗口内发生上下文压缩', model_changed: '窗口内模型发生变化',
          unreadable_record: '窗口内存在无法解析的日志记录',
        };
        note += ` 最近响应未计速：${reasons[s.last.reason] || '数据不足'}。`;
      }
      if (s.model === 'unknown') note += ' 模型尚未识别，暂不汇总分位数。';
      if (s.stream?.count && s.stream.count < 20) note += ' 本轮采样窗较少，分位数仅供参考。';
    } else if (active === 'counts') {
      rows = [['已启动轮次', stats?.turns ?? '待统计'], ['已完成工具步数', stats?.steps ?? '待统计']];
      note = '累计当前聊天启动的任务轮次，以及已完成的工具调用（包括命令、文件修改、搜索等）；按事件 ID 去重。思考、正文片段和正在执行的工具不增加步数。不包含其他聊天或子代理自己聊天里的调用。';
    } else if (active === 'usage') {
      rows = [
        ['累计 Token', fmt(stats?.total_tokens)], ['输入', fmt(stats?.input)],
        ['缓存读取', fmt(stats?.cached)], ['输出', fmt(stats?.output)],
        ['轮次 / 工具调用', stats ? `${stats.turns} / ${stats.steps}` : '—'],
      ];
      note = Number.isFinite(stats?.total_tokens) ? '来自当前聊天已结算的实际用量。缓存比例为累计缓存输入 / 累计输入；新响应结束后更新。工具执行结果属于输入。' : '首次响应尚未返回实际用量，暂显示待统计；不会使用其他聊天的数据。';
    } else {
      rows = [['已用', fmt(stats?.context_used)], ['可用窗口', fmt(stats?.context_window || null)], ['占比', Number.isFinite(stats?.context_pct) ? `${Math.round(stats.context_pct)}%` : '—']];
      note = Number.isFinite(stats?.context_pct) ? '最近已结算请求的输入 Token / 上下文窗口；生成期间保留该值，结束后更新，不是实时占用。' : '首次响应尚未返回输入 Token 与上下文窗口，暂显示待统计。';
    }
    const signature = JSON.stringify([active, rows, note]);
    if (signature === lastDetail) return;
    lastDetail = signature;
    const pop = popEl(active);
    pop.replaceChildren();
    const heading = document.createElement('h4');
    heading.textContent = title;
    pop.appendChild(heading);
    for (const [label, value] of rows) {
      const row = document.createElement('div'), name = document.createElement('span'), number = document.createElement('b');
      row.className = 'rs-row';
      name.textContent = label;
      number.textContent = value;
      row.append(name, number);
      pop.appendChild(row);
    }
    const text = document.createElement('p');
    text.className = 'rs-note';
    text.textContent = note;
    pop.appendChild(text);
    positionPop();
  }
  function render() {
    if (disposed) return;
    syncSelection();
    const s = latestSpeed = tracker.snapshot(selected);
    const busy = s.streaming;
    root.dataset.busy = String(busy);
    root.dataset.flowing = String(s.flowing);
    root.dataset.phase = s.phase;
    root.dataset.tone = s.tps >= 50 ? 'green' : s.tps >= 20 ? 'amber' : 'neutral';
    const label = { thinking: '思考中', streaming: s.tokenizerAvailable ? '采样中' : '分词不可用', tool: '工具中', waiting: '等待输出', interrupted: '已中断', unavailable: '未选聊天', idle: '等待输出', complete: s.stream ? '样本不足' : '未采样' };
    q('.rs-rate').textContent = Number.isFinite(s.tps)
      ? `${s.estimated ? '≈' : ''}${rate(s.tps)} tok/s`
      : !selected && ['pending-chat', 'awaiting-host'].includes(bindingState.reason) ? '等待输出' : label[s.phase] || '— tok/s';
    const showPercentiles = s.finished && (s.stream?.count || 0) > 0;
    q('.rs-percentiles').hidden = !showPercentiles;
    q('.rs-percentiles').setAttribute('aria-hidden', String(!showPercentiles));
    q('.rs-fill').style.width = `${Math.min(100, Math.max(0, (s.tps || 0) / 80 * 100))}%`;
    q('.rs-spinner').style.transform = `rotate(${(s.pulse % 8) * 45}deg)`;
    q('[data-k=p50]').textContent = showPercentiles ? `≈${rate(s.stream.p50)}` : '';
    q('[data-k=p95]').textContent = showPercentiles ? `≈${rate(s.stream.p95)}` : '';
    q('.rs-speed').title = '本轮可观测 Token 流：最近 2 秒速度；P50/P95 为本轮约 1 秒采样窗。完成后保留最后数值与矩形。';
    q('[data-k=counts]').textContent = stats ? `↻ ${fmt(stats.turns)} 轮 ${fmt(stats.steps)} 步` : '↻ 待统计';
    q('.rs-counts').title = stats ? `${stats.turns} 轮 · ${stats.steps} 步（已完成工具调用）` : '当前聊天的轮次与工具步数尚未取得';
    q('[data-k=tokens]').textContent = Number.isFinite(stats?.total_tokens) ? `▤ ${fmt(stats.total_tokens)} tok` : '▤ 待统计';
    q('[data-k=cache]').textContent = Number.isFinite(stats?.cache_rate) ? `缓存 ${Math.round(stats.cache_rate)}%` : '缓存 待统计';
    q('[data-k=context]').textContent = `◔ ${Number.isFinite(stats?.context_pct) ? `${Math.round(stats.context_pct)}%` : '待统计'}`;
    q('.rs-context').title = '上下文用量 · 最近已结算请求';
    details();
  }
  function place() {
    frame = 0;
    if (disposed) return;
    if (syncSelection()) render();
    const candidates = [...document.querySelectorAll('[data-composer-footer-responsive], [class*="ComposerLayoutRoot"]')]
      .filter(el => !el.closest('[data-app-shell-active-page="false"]'))
      .map(el => (el.closest('[class*="ComposerLayoutRoot"]') || el).getBoundingClientRect())
      .filter(r => r.height > 40 && r.width > 200 && r.bottom <= innerHeight + 1 && r.bottom > 0)
      .sort((a, b) => b.bottom - a.bottom || b.width - a.width);
    const rect = candidates[0];
    if (!rect) { root.classList.remove('ready'); close(); return; }
    root.style.left = `${Math.round(rect.left)}px`;
    root.style.width = `${Math.round(rect.width)}px`;
    root.style.top = `${Math.round(Math.min(rect.bottom + 4, innerHeight - 22))}px`;
    root.classList.toggle('compact', rect.width < 720);
    root.classList.toggle('narrow', rect.width < 624);
    root.classList.toggle('minimal', rect.width < 480);
    root.classList.toggle('tiny', rect.width < 388);
    root.classList.add('ready');
    positionPop();
  }
  const schedulePlace = () => { if (!frame && !disposed) frame = requestAnimationFrame(place); };
  const observer = new MutationObserver(records => {
    if (records.some(record => !root.contains(record.target))) schedulePlace();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-app-action-sidebar-thread-selected', 'data-app-shell-active-page', 'data-app-action-sidebar-thread-id', 'data-app-action-sidebar-thread-host-id', 'data-above-composer-conversation-id'],
  });
  const onMessage = event => {
    if (event.data?.type === 'mcp-notification') tracker.ingest(event.data);
  };
  const onOutside = event => { if (!root.contains(event.target)) close(); };
  const onKey = event => { if (event.key === 'Escape' && active) { event.stopPropagation(); close(true); } };
  root.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.pop;
    if (active === key) return close();
    close();
    active = key;
    button.setAttribute('aria-expanded', 'true');
    popEl(key).classList.add('open');
    details();
    positionPop();
    popEl(key).focus({ preventScroll: true });
  }));
  window.addEventListener('message', onMessage);
  window.addEventListener('resize', schedulePlace);
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
  const placeTimer = setInterval(place, 1000);
  const renderTimer = setInterval(render, 200);
  window.__codexFooter = {
    installed: true, version: VERSION,
    selection,
    update(value, requested = value) {
      const changed = syncSelection();
      if (!acceptsStats(value, requested, selected)) {
        if (changed) render();
        return;
      }
      stats = value;
      tracker.update(selected, value?.speed || null);
      render();
    },
    inspect: (context = selected) => ({ version: VERSION, selection: selected, binding: { source: bindingState.source, reason: bindingState.reason }, speed: tracker.snapshot(context) }),
    destroy() {
      disposed = true;
      clearInterval(placeTimer);
      clearInterval(renderTimer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', schedulePlace);
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      style.remove();
      window.__codexFooter = undefined;
    },
  };
  place();
  render();
  return 'installed';
})();
