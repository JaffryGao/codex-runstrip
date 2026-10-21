/* 独立浮层，不改写 React 管理的节点。 */
(() => {
  const VERSION = 'thread-metrics-v11';
  const ID = '__codex_footer__';
  if (window.__codexFooter?.version === VERSION && document.getElementById(ID)) return 'already installed';
  window.__codexFooter?.destroy();
  if (!document.body || !window.__RunstripSpeed || !window.__RunstripBinding) return 'not ready';

  const tracker = new window.__RunstripSpeed.SpeedTracker({ countTokens: window.__RunstripTokenizer?.count });
  const style = document.createElement('style');
  style.textContent = `
    #${ID}{--rs-bg:#fff;--rs-fg:#222;--rs-gap:14px;
      position:fixed;z-index:2147483000;display:flex;align-items:center;justify-content:flex-start;
      box-sizing:border-box;padding:0 4px;gap:var(--rs-gap);height:22px;color:var(--color-text-secondary,#85858d);
      font:11.5px/16px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      font-variant-numeric:tabular-nums;user-select:none;visibility:hidden;pointer-events:none}
    #${ID}.ready{visibility:visible}
    #${ID} button{appearance:none;border:0;background:none;box-shadow:none;color:inherit;font:inherit;
      box-sizing:border-box;height:20px;display:inline-flex;align-items:center;gap:5px;padding:0 4px;margin:0;border-radius:4px;
      white-space:nowrap;cursor:pointer;pointer-events:auto;flex-shrink:0}
    #${ID} button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    #${ID} button:active{transform:scale(.98)}
    #${ID} button[aria-expanded=true]{background:color-mix(in srgb,currentColor 12%,transparent)}
    #${ID} .rs-speed{gap:10px;box-sizing:border-box}
    #${ID} .rs-visual{display:flex;align-items:center;width:44px;height:14px;flex-shrink:0}
    #${ID} .rs-wave{display:block;width:100%;height:14px;overflow:hidden;fill:none;
      stroke:currentColor;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}
    #${ID} .rs-wave-flow{animation:__runstrip_wave_flow__ 1.1s linear infinite paused}
    #${ID}[data-flowing=true] .rs-wave-flow{animation-play-state:running}
    @keyframes __runstrip_wave_flow__{from{transform:translateX(0)}to{transform:translateX(-24px)}}
    #${ID} .rs-rate{text-align:left;white-space:nowrap}
    #${ID} .rs-percentiles{display:inline-flex;gap:10px}
    #${ID} .rs-percentiles[hidden]{display:none}
    #${ID} .rs-percentiles em{font-style:normal;margin-right:3px}
    #${ID} .rs-percentiles b{font-weight:500}
    #${ID} .rs-counts{box-sizing:border-box;justify-content:flex-start}
    #${ID} .rs-counts span{overflow:hidden;text-overflow:ellipsis}
    #${ID} .rs-usage,#${ID} .rs-cache{box-sizing:border-box;text-align:left}
    #${ID}.compact{--rs-gap:10px;font-size:11px}
    #${ID}.compact .rs-speed{gap:8px}
    #${ID}.compact .rs-visual{width:36px}
    #${ID}.compact .rs-percentiles{gap:8px}
    #${ID}.narrow .rs-usage{display:none}
    #${ID}.tiny .rs-cache{display:none}
    #${ID}.tiny .rs-counts{display:none}
    #${ID}.tiny .rs-percentiles{display:none}
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
    @media (prefers-color-scheme:dark){#${ID}{--rs-bg:#26262a;--rs-fg:#eee}}
    :root[data-theme=dark] #${ID},:root.dark #${ID}{--rs-bg:#26262a;--rs-fg:#eee}
    :root[data-theme=light] #${ID},:root.light #${ID}{--rs-bg:#fff;--rs-fg:#222}
    @media (prefers-reduced-motion:reduce){#${ID} .rs-wave-flow{animation:none}}
  `;
  document.head.appendChild(style);
  // 独立样式表为输入框下方留出空间，不改写 React 节点或其 inline style。
  const composerStyle = document.createElement('style');
  document.head.appendChild(composerStyle);
  let composerElement = null, composerGroup = null, composerLift = 0;
  const root = document.createElement('div');
  root.id = ID;
  root.dataset.version = VERSION;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Runstrip 会话状态');
  root.innerHTML = `
    <button type="button" class="rs-counts" data-pop="counts" aria-label="聊天轮次与工具步数" aria-expanded="false" aria-controls="${ID}-counts"><span data-k="counts">↻ 待统计</span></button>
    <button type="button" class="rs-usage" data-pop="usage" aria-label="Token 用量" aria-expanded="false" aria-controls="${ID}-usage"><span data-k="tokens">▤ 待统计</span></button>
    <button type="button" class="rs-cache" data-pop="cache" aria-label="缓存命中" aria-expanded="false" aria-controls="${ID}-cache"><span data-k="cache">缓存 待统计</span></button>
    <button type="button" class="rs-speed" data-pop="speed" aria-label="输出速度与分位数" aria-expanded="false" aria-controls="${ID}-speed">
      <span class="rs-visual" aria-hidden="true"><svg class="rs-wave" viewBox="0 0 48 16" preserveAspectRatio="none"><g class="rs-wave-flow"><path class="rs-wave-line" d="M0 8 C3 4.8 9 4.8 12 8 S21 11.2 24 8 S33 4.8 36 8 S45 11.2 48 8 S57 4.8 60 8 S69 11.2 72 8"/></g></svg></span>
      <span class="rs-rate">— Token/s</span>
      <span class="rs-percentiles" hidden aria-hidden="true"><span><em>P50</em><b data-k="p50"></b></span><span><em>P95</em><b data-k="p95"></b></span></span>
    </button>
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
  let wavePulse = null, waveTurn = null;
  function updateWave(s) {
    const animation = q('.rs-wave-flow').getAnimations()[0];
    const playbackRate = Number.isFinite(s.tps) ? Math.min(2, .65 + Math.max(0, s.tps) / 100) : .65;
    // 更新播放倍率而非重建动画，保留当前相位；暂停/减少动效继续由 CSS 控制。
    if (animation && Math.abs(animation.playbackRate - playbackRate) > .01) {
      animation.updatePlaybackRate(playbackRate);
    }
    if (s.turnId !== waveTurn) {
      waveTurn = s.turnId;
      wavePulse = null;
    }
    if (s.pulse === wavePulse || (!s.stream && !s.pulse)) return;
    wavePulse = s.pulse;
    const amplitude = Number.isFinite(s.tps) ? Math.min(3, 2.4 + Math.max(0, s.tps) / 240) : 2.4;
    const top = (8 - amplitude * 4 / 3).toFixed(2);
    const bottom = (8 + amplitude * 4 / 3).toFixed(2);
    q('.rs-wave-line').setAttribute('d',
      `M0 8 C3 ${top} 9 ${top} 12 8 S21 ${bottom} 24 8 S33 ${top} 36 8 S45 ${bottom} 48 8 S57 ${top} 60 8 S69 ${bottom} 72 8`);
  }
  function speedStatus(s) {
    const retained = Number.isFinite(s.tps);
    if (s.phase === 'tool') return retained ? '工具执行中，保留最近流速' : '工具执行中，暂无输出流速';
    if (s.finished) return s.phase === 'interrupted' ? '本轮已中断，保留最后流速' : '本轮已结束，保留最后流速';
    if (s.phase === 'thinking') return retained ? '思考中，保留最近流速' : '思考中，等待可观测输出';
    if (s.flowing) return !s.tokenizerAvailable ? '分词不可用，暂不计速' : retained ? '正在输出，显示当前流速' : '正在采样，累计约 1 秒后显示流速';
    return s.stream ? '等待新输出，保留最近流速' : '等待输出采样';
  }

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
      pop.setAttribute('aria-label', { speed: '输出速度详情', counts: '聊天轮次与工具步数', usage: 'Token 用量详情', cache: '缓存详情' }[key]);
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
    const title = { speed: '本轮 Token 流速', counts: '轮次与步数 · 当前聊天', usage: 'Token 用量 · 当前聊天', cache: '缓存命中 · 当前聊天' }[active];
    let rows, note;
    if (active === 'speed') {
      rows = [
        ['当前状态', speedStatus(s)],
        ['最近 2 秒输出窗', Number.isFinite(s.tps) ? `≈${rate(s.tps)} Token/s` : '尚无有效采样'],
        ['本轮 P50 / P95', s.stream?.count ? `≈${rate(s.stream.p50)} / ≈${rate(s.stream.p95)} Token/s` : '样本不足'],
        ['本轮有效采样窗', s.stream?.count || 0],
        ['本轮观测 Token', s.stream?.tokens != null ? `≈${fmt(s.stream.tokens)}` : '未采样'],
        ['实际输出 Token', fmt(s.last?.outputTokens)],
        ['其中思考 Token', fmt(s.last?.reasoningOutputTokens)],
        ['响应输出窗口', Number.isFinite(s.last?.durationMs) ? `${(s.last.durationMs / 1000).toFixed(2)} 秒` : '计时不可用'],
        ['实际响应均速', `${rate(s.actual?.tps)} Token/s`],
        ['历史实际 P50 / P95', `${rate(s.p50)} / ${rate(s.p95)} Token/s`],
        ['历史有效 / 未计速响应', `${s.count} / ${s.omitted}`],
        ['配置模型', s.model === 'unknown' ? '尚未识别' : s.model],
      ];
      note = '≈ 为可见输出的近似流速；P50/P95 是本轮速度分位数。实际用量与历史均速单独结算。';
      if (!s.tokenizerAvailable) note += ' 分词不可用，暂不计速。';
      if (!s.stream) note += ' 本轮未采样。';
      if (s.partial) note += ' 仅统计接入后的输出。';
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
      if (s.model === 'unknown') note += ' 模型尚未识别。';
      if (s.stream?.count && s.stream.count < 20) note += ' 样本较少，仅供参考。';
    } else if (active === 'counts') {
      rows = [['已启动轮次', stats?.turns ?? '待统计'], ['已完成工具步数', stats?.steps ?? '待统计']];
      note = '仅统计当前聊天已启动的轮次和已完成的工具调用，按 ID 去重。';
    } else if (active === 'usage') {
      rows = [
        ['累计 Token', fmt(stats?.total_tokens)], ['输入', fmt(stats?.input)],
        ['输出', fmt(stats?.output)],
      ];
      note = Number.isFinite(stats?.total_tokens) ? '当前聊天的已结算用量，总量 = 输入 + 输出。' : '等待当前聊天的首次用量结算。';
    } else if (active === 'cache') {
      rows = [
        ['缓存命中率', Number.isFinite(stats?.cache_rate) ? `${Math.round(stats.cache_rate)}%` : '待统计'],
        ['缓存读取 Token', fmt(stats?.cached)],
        ['未缓存输入 Token', Number.isFinite(stats?.input) && Number.isFinite(stats?.cached)
          ? fmt(Math.max(0, stats.input - stats.cached)) : '—'],
      ];
      note = '缓存率 = 缓存输入 / 总输入，按当前聊天已结算用量汇总。';
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
    const label = { thinking: '思考中', streaming: s.tokenizerAvailable ? '采样中' : '分词不可用', tool: '工具执行中', waiting: '等待 Token', interrupted: '已中断', unavailable: '未选聊天', idle: '等待输出', complete: s.stream ? '样本不足' : '未采样' };
    q('.rs-rate').textContent = Number.isFinite(s.tps)
      ? `${s.estimated ? '≈' : ''}${rate(s.tps)} Token/s`
      : !selected && ['pending-chat', 'awaiting-host'].includes(bindingState.reason) ? '等待输出' : label[s.phase] || '— Token/s';
    const showPercentiles = s.finished && (s.stream?.count || 0) > 0;
    q('.rs-percentiles').hidden = !showPercentiles;
    q('.rs-percentiles').setAttribute('aria-hidden', String(!showPercentiles));
    updateWave(s);
    q('[data-k=p50]').textContent = showPercentiles ? `≈${rate(s.stream.p50)}` : '';
    q('[data-k=p95]').textContent = showPercentiles ? `≈${rate(s.stream.p95)}` : '';
    q('.rs-speed').title = `${speedStatus(s)}。波浪随 Token/s 加快或放慢，无新输出时暂停。P50/P95 在本轮结束后显示。`;
    q('[data-k=counts]').textContent = stats ? `↻ ${fmt(stats.turns)} 轮 ${fmt(stats.steps)} 步` : '↻ 待统计';
    q('.rs-counts').title = stats ? `${stats.turns} 轮 · ${stats.steps} 步（已完成工具调用）` : '当前聊天的轮次与工具步数尚未取得';
    q('[data-k=tokens]').textContent = Number.isFinite(stats?.total_tokens) ? `▤ ${fmt(stats.total_tokens)} Token` : '▤ 待统计';
    q('[data-k=cache]').textContent = Number.isFinite(stats?.cache_rate) ? `缓存 ${Math.round(stats.cache_rate)}%` : '缓存 待统计';
    details();
  }
  function place() {
    frame = 0;
    if (disposed) return;
    if (syncSelection()) render();
    const candidates = [...document.querySelectorAll('[data-composer-footer-responsive], [class*="ComposerLayoutRoot"]')]
      .filter(el => !el.closest('[data-app-shell-active-page="false"]'))
      .map(el => el.closest('[class*="ComposerLayoutRoot"]') || el)
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({rect: r}) => r.height > 40 && r.width > 200 && r.bottom <= innerHeight + 1 && r.bottom > 0)
      .sort((a, b) => b.rect.bottom - a.rect.bottom || b.rect.width - a.rect.width);
    const candidate = candidates[0];
    if (!candidate) {
      root.classList.remove('ready'); close();
      composerStyle.textContent = ''; composerElement = composerGroup = null; composerLift = 0;
      return;
    }
    // 项目/位置/分支栏、附件轨道和输入框属于同一组，必须一起移动。
    const group = candidate.el.closest('[data-codex-composer-root]') || candidate.el;
    if (candidate.el !== composerElement || group !== composerGroup) {
      composerStyle.textContent = '';
      composerElement = candidate.el; composerGroup = group; composerLift = 0;
    }
    let rect = composerElement.getBoundingClientRect();
    // 输入框 → 4px → 状态条 22px → 底部安全区 8px。
    const lift = Math.max(0, Math.ceil(rect.bottom + composerLift + 34 - innerHeight));
    if (lift !== composerLift) {
      const path = [];
      for (let el = composerGroup; el && el !== document.body; el = el.parentElement) {
        path.unshift(`${el.tagName.toLowerCase()}:nth-child(${[...el.parentElement.children].indexOf(el) + 1})`);
      }
      composerStyle.textContent = lift ? `body > ${path.join(' > ')}{translate:0 -${lift}px!important}` : '';
      composerLift = lift;
      rect = composerElement.getBoundingClientRect();
    }
    root.style.left = `${Math.round(rect.left)}px`;
    root.style.width = `${Math.round(rect.width)}px`;
    root.style.top = `${Math.round(Math.min(rect.bottom + 4, innerHeight - 30))}px`;
    root.classList.toggle('compact', rect.width < 720);
    root.classList.toggle('narrow', rect.width < 560);
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
      composerStyle.remove();
      window.__codexFooter = undefined;
    },
  };
  place();
  render();
  return 'installed';
})();
