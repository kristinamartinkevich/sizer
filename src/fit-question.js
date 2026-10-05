(function (root) {
  // The "did it fit?" question, one sizing at a time: Did you buy it? Which size? How did it fit?
  // The steps and their markup are pure (tested in node); mount() binds them to a container in the
  // popup, the side panel or the sheet on a shop page, and hands the answer to the caller to send.
  const Feedback = root.SizerFeedback || (typeof require === 'function' ? require('./feedback.js') : null);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateText = (at) => { const d = new Date(at); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const OUTCOME_WORDS = { small: 'Too small', right: 'Right', big: 'Too big' };
  const AREA_WORDS = { bust: 'Bust', chest: 'Chest', waist: 'Waist', hip: 'Hips', length: 'Length', inseam: 'Leg', shoulder: 'Shoulders', sleeve: 'Sleeves', foot: 'Foot' };
  const norm = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

  function start(sizing) {
    return { step: 'bought', sizing, size: null, outcome: null, areas: [], error: null };
  }

  // One click, one new state. "send" leaves the state at "sending"; the caller sends and then calls
  // next(state, 'sent') or next(state, 'failed').
  function next(state, act, value) {
    const s = { ...state, error: null };
    switch (act) {
      case 'yes': return { ...s, step: 'size' };
      case 'no': return { ...s, step: 'dismissed' };
      case 'size': {
        const v = String(value || '').trim().slice(0, 20);
        return v ? { ...s, size: v, step: 'fit' } : { ...s, error: 'Type the size on the label.' };
      }
      case 'outcome': return Feedback.OUTCOMES.includes(value) ? { ...s, outcome: value, areas: value === 'right' ? [] : s.areas } : s;
      case 'area': {
        if (!Feedback.areasFor(s.sizing.kind).includes(value)) return s;
        return { ...s, areas: s.areas.includes(value) ? s.areas.filter((a) => a !== value) : s.areas.concat(value) };
      }
      case 'back': return { ...s, step: s.step === 'fit' ? 'size' : 'bought' };
      case 'send': return s.size && s.outcome ? { ...s, step: 'sending' } : { ...s, error: 'Pick how it fitted.' };
      case 'sent': return { ...s, step: 'done' };
      case 'failed': return { ...s, step: 'fit', error: 'Sizer could not save that. Try again.' };
      default: return s;
    }
  }

  // What the caller sends to the background worker for this state.
  function answerOf(state) {
    return { sizeBought: state.size, outcome: state.outcome, areas: state.outcome === 'right' ? [] : state.areas.slice() };
  }

  function sizeChoices(sizing) {
    const out = [];
    for (const v of [sizing.size].concat(sizing.sizes || [])) if (v && !out.some((x) => norm(x) === norm(v))) out.push(String(v));
    return out.slice(0, 16);
  }

  function html(state) {
    const s = state.sizing;
    const what = esc([s.brand, s.style && s.style.toLowerCase().startsWith(String(s.brand || '').toLowerCase()) ? s.style.slice(String(s.brand).length).trim() : s.style].filter(Boolean).join(' ') || 'this item');
    const head = `<p class="fq-item"><b>${what}</b><span>${esc(s.shop ? s.shop.replace(/^www\./, '') : '')}${s.shop ? ', ' : ''}sized ${esc(s.size)} on ${dateText(s.at)}</span></p>`;
    const err = state.error ? `<p class="fq-error" role="alert">${esc(state.error)}</p>` : '';
    const btn = (act, label, v, on) => `<button type="button" class="fq-b${on ? ' on' : ''}" data-fq="${act}"${v != null ? ` data-v="${esc(v)}"` : ''}${on != null ? ` aria-pressed="${on ? 'true' : 'false'}"` : ''}>${esc(label)}</button>`;
    switch (state.step) {
      case 'bought':
        return `${head}<p class="fq-q">Did you buy it?</p><div class="fq-row">${btn('yes', 'Yes')}${btn('no', 'No')}</div>`;
      case 'size':
        return `${head}<p class="fq-q">Which size?</p><div class="fq-row">${sizeChoices(s).map((v) => btn('size', v, v)).join('')}</div>
          <div class="fq-row fq-other"><input class="fq-input" data-fq-input aria-label="Another size" placeholder="Another size" maxlength="20">${btn('size-typed', 'Use this')}</div>${err}
          <div class="fq-row">${btn('back', 'Back')}</div>`;
      case 'fit':
      case 'sending': {
        const areas = state.outcome && state.outcome !== 'right' ? Feedback.areasFor(s.kind) : [];
        return `${head}<p class="fq-q">How did ${esc(state.size)} fit?</p>
          <div class="fq-row">${Feedback.OUTCOMES.map((o) => btn('outcome', OUTCOME_WORDS[o], o, state.outcome === o)).join('')}</div>
          ${areas.length ? `<p class="fq-q fq-sub">Where? Optional.</p><div class="fq-row">${areas.map((a) => btn('area', AREA_WORDS[a], a, state.areas.includes(a))).join('')}</div>` : ''}
          ${err}<div class="fq-row">${btn('back', 'Back')}<button type="button" class="fq-b fq-send" data-fq="send"${state.step === 'sending' ? ' disabled' : ''}>${state.step === 'sending' ? 'Saving' : 'Save'}</button></div>`;
      }
      case 'done':
        return `${head}<p class="fq-done">Thanks. ${esc(s.brand || 'This piece')} in ${esc(state.size)} is now one of the pieces you own, so your next sizes learn from it.</p>`;
      case 'dismissed':
        return `${head}<p class="fq-done">Got it. Sizer will not ask about this one again.</p>`;
      default:
        return '';
    }
  }

  // Binds one question to a container. onAnswer(answer) and onDismiss() return promises; a rejected
  // or falsy answer shows the error and keeps the choices.
  function mount(el, sizing, { onAnswer, onDismiss }) {
    let state = start(sizing);
    const render = () => {
      el.innerHTML = html(state);
      el.dataset.step = state.step;
    };
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-fq]');
      if (!b || !el.contains(b)) return;
      const act = b.dataset.fq;
      if (act === 'size-typed') {
        const input = el.querySelector('[data-fq-input]');
        state = next(state, 'size', input ? input.value : '');
      } else {
        state = next(state, act, b.dataset.v);
      }
      render();
      if (act === 'no') { try { await onDismiss(); } catch { /* the question just shows again next time */ } }
      if (state.step === 'sending') {
        let ok = false;
        try { ok = !!(await onAnswer(answerOf(state))); } catch { ok = false; }
        state = next(state, ok ? 'sent' : 'failed');
        render();
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-fq-input]')) {
        e.preventDefault();
        state = next(state, 'size', e.target.value);
        render();
      }
    });
    render();
    return { get state() { return state; } };
  }

  // Works in the popup and side panel (ui.css variables) and inside the sheet's shadow root.
  const STYLE = `
.fq { padding: 12px 0; border-top: 1px solid var(--line, var(--hair)); }
.fq:first-child { border-top: 0; }
.fq-item { margin: 0 0 6px; display: flex; flex-direction: column; gap: 1px; }
.fq-item b { font-weight: 600; }
.fq-item span { font-size: 12px; color: var(--muted); }
.fq-q { margin: 8px 0 6px; font-weight: 600; }
.fq-sub { font-weight: 400; color: var(--muted); font-size: 13px; }
.fq-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
.fq-b { border: 1px solid var(--line, var(--hair)); border-radius: 999px; padding: 5px 12px; background: none; color: inherit; font-size: 13px; }
.fq-b:hover { border-color: var(--muted); }
.fq-b.on, .fq-send { background: var(--accent); border-color: var(--accent); color: var(--accent-ink, var(--fog)); }
.fq-send { margin-left: auto; font-weight: 600; }
.fq-send:disabled { opacity: .6; }
.fq-input { flex: 1; min-width: 0; border: 1px solid var(--line, var(--hair)); border-radius: 999px; padding: 5px 12px; background: none; color: inherit; font: inherit; font-size: 13px; }
.fq-error { margin: 4px 0; font-size: 13px; color: var(--signal); }
.fq-done { margin: 6px 0 0; font-size: 13px; color: var(--muted); }
`;

  const api = { start, next, answerOf, html, mount, sizeChoices, STYLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SizerFitQuestion = api;
})(globalThis);
