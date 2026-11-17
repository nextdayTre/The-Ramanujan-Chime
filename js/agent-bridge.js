/* ===== window.ramanujanSphere — the in-page agent bridge =====
   Implements docs/AGENT-INTERFACE.md §6 exactly:
   - installs once (after Harmony.App is initialized), fills the Agent dock panel;
   - exposes getState/setState/setTab/setClock/step/play/pause/reset/call/
     getManifest/tools/getDeeplink/subscribe;
   - emits `ramanujan-sphere:ready` once and `ramanujan-sphere:change` exactly once
     on mount, then only on genuine structural changes (never for no-op setters and
     never for animation ticks);
   - marks the DOM for automation: body[data-agent-ready="true"],
     [data-agent-status="bridge-active"], body[data-agent-clock] (maintained by app.js).

   This file is additive: it never changes the instrument's maths or rendering. */
(function () {
  'use strict';

  if (window.__ramanujanSphereBridgeInstalled) return;
  var Harmony = window.Harmony || {};
  var App = Harmony.App;
  var Core = Harmony.AgentCore;
  if (!App) {
    // app.js failed to boot; nothing to bridge to.
    if (window.console && console.warn) console.warn('[agent] bridge skipped: Harmony.App missing');
    return;
  }

  var TOOL_ID = (Core && Core.TOOL_ID) || 'ramanujan-sphere';
  var SCHEMA_VERSION = (Core && Core.SCHEMA_VERSION) || 1;
  var TOOLSET_VERSION = (Core && Core.TOOLSET_VERSION) || '1.0.0';
  var EVENT_READY = (Core && Core.EVENT_READY) || 'ramanujan-sphere:ready';
  var EVENT_CHANGE = (Core && Core.EVENT_CHANGE) || 'ramanujan-sphere:change';

  var installed = false;
  var subscribers = [];
  var disposers = [];
  var panelTimer = null;
  var lastJson = null;
  var copyWired = false;

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function jsonOf(value) {
    try { return JSON.stringify(value); } catch (e) { return ''; }
  }

  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  function baseUrl() {
    try {
      if (location.origin && location.origin !== 'null') return location.origin + location.pathname;
    } catch (e) { /* ignore */ }
    return String(location.href).split('#')[0].split('?')[0];
  }

  function getState() {
    try { return (App.getAgentState ? App.getAgentState() : null); } catch (e) { return null; }
  }

  function getDeeplink() {
    try { return (App.getDeeplink ? App.getDeeplink() : baseUrl()); } catch (e) { return baseUrl(); }
  }

  function getManifest() {
    try { return (Core && typeof Core.getManifest === 'function') ? Core.getManifest() : null; }
    catch (e) { return null; }
  }

  function toolNames() {
    if (Core && Core.TOOL_NAMES && Core.TOOL_NAMES.length) return Core.TOOL_NAMES.slice();
    var m = getManifest();
    if (m && m.tools && m.tools.length) {
      return m.tools.map(function (t) { return t.name; });
    }
    return [];
  }

  function tools() {
    var m = getManifest();
    return (m && m.tools) ? m.tools : [];
  }

  function failureEnvelope(tool, code, message, hint) {
    var err = { code: code, message: message };
    if (hint) err.hint = hint;
    return { ok: false, schemaVersion: SCHEMA_VERSION, tool: String(tool), error: err, warnings: [] };
  }

  function setterFailure(code, message, hint) {
    return { ok: false, error: failureEnvelope('bridge', code, message, hint).error, state: getState() };
  }

  // ---- change fan-out -------------------------------------------------------
  function dispatch(name, state) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: state }));
    } catch (e) {
      // Very old engines: fall back to a plain event with a detail property.
      try {
        var ev = document.createEvent('CustomEvent');
        ev.initCustomEvent(name, false, false, state);
        window.dispatchEvent(ev);
      } catch (e2) { /* ignore */ }
    }
  }

  function notifySubscribers(state) {
    var list = subscribers.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](state); } catch (e) { /* isolate throwing subscribers */ }
    }
  }

  function emitChange(state) {
    if (!installed || !state) return;
    var json = jsonOf(state);
    if (json === lastJson) return;   // no-op / duplicate publish => no event
    lastJson = json;
    updatePanel(state);
    notifySubscribers(state);
    dispatch(EVENT_CHANGE, state);
  }

  // App publishes on every structural change (bump); this dedupes genuine changes.
  function onAppPublish(state) { emitChange(state); }

  // ---- Agent panel rendering ----------------------------------------------
  function $(sel, root) {
    try { return (root || document).querySelector(sel); } catch (e) { return null; }
  }

  function buildHandoffPrompt() {
    var deeplink = getDeeplink() || '';
    var base = baseUrl();
    var names = toolNames();
    var lines = [
      'Drive "Ramanujan\'s Compassion" (tool id: ' + TOOL_ID +
        ', schemaVersion ' + SCHEMA_VERSION + ', toolset ' + TOOLSET_VERSION + ').',
      '',
      'Current view (deeplink): ' + deeplink,
      'Onboarding: ' + base + 'AGENTS.md',
      'Contract: ' + base + 'docs/AGENT-INTERFACE.md',
      'Manifest + tool schemas: ' + base + 'agent/manifest.json',
      '',
      'Live page API: window.ramanujanSphere.getState(); .setTab("harmonics");',
      '.setState({ preset: 12, twin: "conjugate", static: 1 }); .setClock(0.25); .step(0.1);',
      '.play(); .pause(); .reset(); .call(name, args). Headless equivalents:',
      'node agent/cli.mjs <tool> --json  ·  node agent/mcp-server.mjs (MCP stdio).',
      '',
      names.length + ' pure tools: ' + names.join(', ')
    ];
    return lines.join('\n');
  }

  function fillToolList() {
    var ul = $('#agentToolList');
    var countEl = $('#agentToolCount');
    var list = tools();
    var names = toolNames();
    if (countEl) countEl.textContent = String(names.length);
    if (!ul) return;
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    if (!list.length) {
      var li = document.createElement('li');
      li.className = 'agent-tool-empty';
      li.textContent = 'tool registry unavailable (js/agent-core.js not loaded)';
      ul.appendChild(li);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var tool = list[i];
      var row = document.createElement('li');
      var codeEl = document.createElement('code');
      codeEl.textContent = tool.name;
      var descEl = document.createElement('span');
      descEl.className = 'agent-tool-desc';
      // One compact line per tool: short title; full description on hover.
      var full = String(tool.description || '');
      var shortTitle = tool.title || full.split(/[.;(]/)[0] || '';
      descEl.textContent = shortTitle;
      var hover = tool.name + (tool.title ? ' — ' + tool.title : '') + (full ? '\n' + full : '');
      row.title = hover;
      descEl.title = hover;
      row.appendChild(codeEl);
      row.appendChild(descEl);
      ul.appendChild(row);
    }
  }

  function updatePanel(state) {
    var dl = $('#agentDeeplink');
    if (dl) {
      var deeplink = getDeeplink() || '';
      if (dl.textContent !== deeplink) dl.textContent = deeplink;
    }
    var sj = $('#agentStateJson');
    if (sj && state) {
      var json = jsonOf(state);
      if (sj.textContent !== json) sj.textContent = json;
    }
    var hp = $('#agentHandoffPrompt');
    if (hp) {
      var prompt = buildHandoffPrompt();
      if (hp.textContent !== prompt) hp.textContent = prompt;
    }
    var badge = $('[data-agent-status]');
    if (badge) {
      if (badge.getAttribute('data-agent-status') !== 'bridge-active') {
        badge.setAttribute('data-agent-status', 'bridge-active');
      }
      if (badge.textContent !== 'bridge-active') badge.textContent = 'bridge-active';
    }
  }

  // ---- clipboard with a graceful fallback ---------------------------------
  function legacyCopy(text) {
    var ok = false;
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    try {
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
    } catch (e) { ok = false; }
    try { document.body.removeChild(ta); } catch (e2) { /* ignore */ }
    return ok;
  }

  function flashButton(btn, ok) {
    if (!btn || !btn.dataset) return;
    if (btn.__copyTimer) clearTimeout(btn.__copyTimer);
    if (!btn.__copyLabel) btn.__copyLabel = btn.textContent;
    btn.textContent = ok ? 'Copied!' : 'Copy failed';
    btn.classList.toggle('copy-ok', !!ok);
    btn.__copyTimer = setTimeout(function () {
      btn.textContent = btn.__copyLabel;
      btn.classList.remove('copy-ok');
      btn.__copyTimer = null;
    }, 1400);
  }

  function copyText(text, btn) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(function () {
        flashButton(btn, true);
      }, function () {
        flashButton(btn, legacyCopy(text));
      });
    } else {
      flashButton(btn, legacyCopy(text));
    }
  }

  function copyValue(kind) {
    if (kind === 'deeplink') return getDeeplink() || '';
    if (kind === 'handoff') return buildHandoffPrompt();
    if (kind === 'state') {
      var st = getState();
      return st ? jsonOf(st) : '';
    }
    return '';
  }

  function wireCopyButtons() {
    if (copyWired) return;
    var panel = $('[data-agent-panel="agent"]');
    if (!panel) return;
    copyWired = true;
    panel.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-agent-copy]') : null;
      if (!btn) return;
      ev.preventDefault();
      var kind = btn.getAttribute('data-agent-copy');
      var text = copyValue(kind);
      if (!text) { flashButton(btn, false); return; }
      try { copyText(text, btn); } catch (e) { flashButton(btn, false); }
    });
  }

  // ---- bridge API ---------------------------------------------------------
  function bridgeSetState(patch) {
    try {
      if (!App.applyAgentPatch) return setterFailure('E_INTERNAL', 'agent core unavailable');
      var res = App.applyAgentPatch(patch);
      if (!res || typeof res !== 'object') {
        return setterFailure('E_INTERNAL', 'patch application returned no result');
      }
      if (res.ok) emitChange(res.state);
      return res;
    } catch (e) {
      return setterFailure('E_INTERNAL', 'setState failed');
    }
  }

  function setClock(t) {
    var n = Number(t);
    if (!isFinite(n)) {
      return setterFailure('E_BAD_ARGS', 'setClock expects a number between 0 and 1', 'setClock(0.25)');
    }
    // Clamp + pause so the frame is reproducible (contract §6).
    return bridgeSetState({ playT: clamp01(n) });
  }

  function step(delta) {
    var d = Number(delta);
    if (!isFinite(d)) {
      return setterFailure('E_BAD_ARGS', 'step expects a finite number', 'step(0.1)');
    }
    var st = getState();
    var cur = (st && st.transport) ? Number(st.transport.playT) || 0 : 0;
    return setClock(cur + d);
  }

  function play() { return bridgeSetState({ animate: true }); }
  function pause() { return bridgeSetState({ animate: false }); }

  function reset() {
    try {
      if (typeof App.resetAgentState !== 'function') {
        return setterFailure('E_INTERNAL', 'reset unavailable');
      }
      var st = App.resetAgentState();
      emitChange(st);
      return { ok: true, state: st || getState(), warnings: [] };
    } catch (e) {
      return setterFailure('E_INTERNAL', 'reset failed');
    }
  }

  function call(name, args) {
    try {
      if (!Core || typeof Core.callTool !== 'function') {
        return failureEnvelope(name, 'E_INTERNAL', 'agent core unavailable');
      }
      return Core.callTool(name, args);
    } catch (e) {
      return failureEnvelope(name, 'E_INTERNAL', 'tool call failed');
    }
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);
    try { fn(getState()); } catch (e) { /* isolated */ }
    var off = false;
    return function () {
      if (off) return;
      off = true;
      var i = subscribers.indexOf(fn);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  var bridge = {
    toolId: TOOL_ID,
    schemaVersion: SCHEMA_VERSION,
    version: TOOLSET_VERSION,
    ready: false,
    __installed: false,
    getManifest: getManifest,
    tools: tools,
    getState: getState,
    setState: bridgeSetState,
    setTab: function (tab) { return bridgeSetState({ tab: tab }); },
    setClock: setClock,
    step: step,
    play: play,
    pause: pause,
    reset: reset,
    call: call,
    getDeeplink: getDeeplink,
    subscribe: subscribe,
    __dispose: dispose
  };

  // ---- install / dispose --------------------------------------------------
  function install() {
    if (installed) return;
    installed = true;
    window.__ramanujanSphereBridgeInstalled = true;
    bridge.ready = true;
    bridge.__installed = true;
    window.ramanujanSphere = bridge;

    try { document.body.setAttribute('data-agent-ready', 'true'); } catch (e) { /* ignore */ }

    var initial = getState();
    lastJson = jsonOf(initial);

    var off = App.subscribe(onAppPublish);
    if (typeof off === 'function') disposers.push(off);

    fillToolList();
    updatePanel(initial);
    wireCopyButtons();

    // Live state JSON in the panel: on-change already covers structural updates;
    // this poll only refreshes the displayed playT/derived values between events.
    panelTimer = setInterval(function () {
      if (!installed) return;
      var st = getState();
      if (st) updatePanel(st);
    }, 750);

    // Exactly one :ready and exactly one mount :change.
    dispatch(EVENT_READY, initial);
    dispatch(EVENT_CHANGE, initial);
  }

  function dispose() {
    if (!installed) return;
    installed = false;
    bridge.ready = false;
    bridge.__installed = false;
    if (panelTimer) { clearInterval(panelTimer); panelTimer = null; }
    while (disposers.length) {
      try { disposers.pop()(); } catch (e) { /* ignore */ }
    }
    try { document.body.removeAttribute('data-agent-ready'); } catch (e) { /* ignore */ }
    var badge = $('[data-agent-status]');
    if (badge) {
      badge.setAttribute('data-agent-status', 'bridge-idle');
      badge.textContent = 'bridge-idle';
    }
    window.__ramanujanSphereBridgeInstalled = false;
    lastJson = null;
  }

  // Install only after the app has finished its mount (preset + deeplink applied)
  // so the mount emits exactly one change event with the final initial state.
  if (typeof App.isReady === 'function' && App.isReady()) {
    install();
  } else if (typeof App.onReady === 'function') {
    App.onReady(install);
  } else {
    // Fallback: poll briefly for readiness.
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      if (App.isReady && App.isReady()) { clearInterval(poll); install(); }
      else if (tries > 200) { clearInterval(poll); }
    }, 50);
  }
})();
