/* 页面上的正式会话 ID 优先；侧栏的新建会话别名不能用于日志或流式事件。 */
((root) => {
  const realId = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  const validHost = value => typeof value === 'string' && value.length > 0;
  const active = element => !element.closest('[data-app-shell-active-page="false"]');
  const unique = scopes => [...new Map(scopes.map(scope => [JSON.stringify([scope.hostId, scope.threadId]), scope])).values()];

  function ownerScopes(element, threadId) {
    const key = Object.keys(element).find(name => name.startsWith('__reactFiber$'));
    const fiber = key && element[key];
    const scopes = [];
    // 当前 Codex 将 hostId 与正式 conversationId 放在输入框所属组件上；只读并严格匹配 ID。
    for (const start of [fiber, fiber?.alternate]) {
      let current = start;
      for (let depth = 0; current && depth < 96; depth++, current = current.return) {
        const props = current.memoizedProps;
        if (props?.conversationId === threadId && validHost(props.hostId)) {
          scopes.push({ hostId: props.hostId, threadId });
          break;
        }
      }
    }
    return unique(scopes);
  }

  function resolve(document, knownScopes = []) {
    const visible = selector => [...document.querySelectorAll(selector)].filter(active);
    const markers = visible('[data-above-composer-conversation-id]');
    const ids = [...new Set(markers.map(e => e.getAttribute('data-above-composer-conversation-id')).filter(realId))];
    const rows = visible('[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"]');
    const sidebar = unique(rows.flatMap(row => {
      const key = row.getAttribute('data-app-action-sidebar-thread-id');
      const hostId = row.getAttribute('data-app-action-sidebar-thread-host-id');
      const threadId = key?.startsWith('local:') ? key.slice(6) : null;
      return row.getAttribute('data-app-action-sidebar-thread-kind') === 'local' && realId(threadId) && validHost(hostId)
        ? [{ hostId, threadId }] : [];
    }));
    const result = (selection, source, reason = null) => ({ selection, source, reason });
    if (ids.length > 1) return result(null, 'composer', 'ambiguous-chat');
    if (ids.length === 1) {
      const threadId = ids[0];
      const owners = unique(markers.flatMap(e => e.getAttribute('data-above-composer-conversation-id') === threadId ? ownerScopes(e, threadId) : []));
      if (owners.length === 1) return result(owners[0], 'composer-owner');
      if (owners.length > 1) return result(null, 'composer-owner', 'ambiguous-host');
      const matches = unique([...sidebar, ...knownScopes].filter(scope => scope.threadId === threadId && validHost(scope.hostId)));
      return matches.length === 1 ? result(matches[0], 'composer-id')
        : result(null, 'composer-id', matches.length ? 'ambiguous-host' : 'awaiting-host');
    }
    if (markers.length || visible('[data-codex-composer-root]').length) return result(null, 'composer', 'pending-chat');
    return sidebar.length === 1 ? result(sidebar[0], 'sidebar')
      : result(null, 'sidebar', rows.length ? 'pending-chat' : 'unavailable');
  }
  const api = { resolve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.__RunstripBinding = api;
})(globalThis);
