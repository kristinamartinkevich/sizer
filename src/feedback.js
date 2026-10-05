(function (root) {
  // "You bought it, did it fit?" Pure helpers for the recent-sizings list kept in local storage, the
  // question's timing, and what an answer turns into: a piece you own (local) and an anonymous
  // outcome (sent). No DOM, no chrome.

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const KEEP = 50;
  const KEEP_DAYS = 60;
  const ASK_AFTER_DAYS = 7;
  // A reload or a second look the same evening is not a revisit; coming back the next day is.
  const REVISIT_AFTER = 12 * HOUR;

  // Adds or refreshes one sizing, newest first, dropping the oldest and anything past 60 days. An
  // item answered or dismissed before stays that way when it is sized again.
  function remember(list, sizing, now) {
    const before = (list || []).find((s) => s.itemKey === sizing.itemKey);
    // A sizing still waiting for its answer keeps what was suggested then, and when: coming back to
    // the page must not swap in today's suggestion or restart the week.
    if (before && !before.answered && !before.dismissed && now - before.at <= KEEP_DAYS * DAY) {
      const rest = (list || []).filter((s) => s.itemKey !== sizing.itemKey && now - s.at <= KEEP_DAYS * DAY);
      return [before, ...rest].sort((a, b) => b.at - a.at).slice(0, KEEP);
    }
    const kept = {};
    if (before && before.answered) { kept.answered = before.answered; if (before.outcome) kept.outcome = before.outcome; }
    if (before && before.dismissed) kept.dismissed = true;
    const rest = (list || []).filter((s) => s.itemKey !== sizing.itemKey && now - s.at <= KEEP_DAYS * DAY);
    return [{ ...sizing, ...kept }, ...rest].sort((a, b) => b.at - a.at).slice(0, KEEP);
  }

  // Sizings a week old or more that have not been answered or dismissed.
  function due(list, now) {
    return (list || []).filter((s) => !s.answered && !s.dismissed && now - s.at >= ASK_AFTER_DAYS * DAY);
  }

  // Coming back to a product sized before is the best moment to ask, whatever its age. Given the
  // time, a sizing from the last few hours (this same visit, a reload) does not count.
  function askOnRevisit(list, itemKey, now) {
    const s = (list || []).find((x) => x.itemKey === itemKey && !x.answered && !x.dismissed) || null;
    if (s && now != null && now - s.at < REVISIT_AFTER) return null;
    return s;
  }

  const FIT_OF = { small: 'tight', right: 'perfect', big: 'loose' };
  const OUTCOMES = Object.keys(FIT_OF);
  const AREAS = ['bust', 'chest', 'waist', 'hip', 'length', 'inseam', 'shoulder', 'sleeve', 'foot'];
  // The kinds of clothing the engine sizes, and the piece types the fit profile keeps.
  const KINDS = ['bottoms', 'tops', 'dresses', 'outerwear', 'shoes'];
  const TYPES = ['jeans', 'trousers', 'skirt', 'shorts', 'top', 'dress', 'jacket', 'shoes'];
  const KIND_OF_TYPE = { jeans: 'bottoms', trousers: 'bottoms', skirt: 'bottoms', shorts: 'bottoms', top: 'tops', dress: 'dresses', jacket: 'outerwear', shoes: 'shoes' };
  const TYPE_OF_KIND = { bottoms: 'trousers', tops: 'top', dresses: 'dress', outerwear: 'jacket', shoes: 'shoes' };
  const AREAS_OF_KIND = {
    bottoms: ['waist', 'hip', 'inseam', 'length'],
    tops: ['bust', 'shoulder', 'sleeve', 'length'],
    dresses: ['bust', 'waist', 'hip', 'length'],
    outerwear: ['chest', 'shoulder', 'sleeve', 'length'],
    shoes: ['foot'],
  };

  const kindOf = (k) => (KINDS.includes(k) ? k : KIND_OF_TYPE[k] || null);

  // The piece type the fit profile would file this product under, from its title and kind.
  function typeOf(title, kind) {
    const k = kindOf(kind);
    if (!k) return null;
    if (k !== 'bottoms') return TYPE_OF_KIND[k];
    const t = String(title || '');
    // Before jeans, so denim shorts and a denim skirt are filed as what they are.
    if (/\b(?:shorts?)\b/i.test(t)) return 'shorts';
    if (/\b(?:skirts?|jupes?|rock|falda|gonna|rok)\b/i.test(t)) return 'skirt';
    if (/\b(?:jeans?|denim)\b/i.test(t)) return 'jeans';
    return 'trousers';
  }

  // The areas the question offers for a size that did not fit, by kind of clothing.
  function areasFor(kind) {
    return (AREAS_OF_KIND[kindOf(kind)] || []).slice();
  }

  function toAnchor(sizing, answer) {
    const type = TYPES.includes(sizing.type) ? sizing.type : TYPES.includes(sizing.kind) ? sizing.kind : TYPE_OF_KIND[sizing.kind];
    if (!type || !answer.sizeBought || !FIT_OF[answer.outcome]) return null;
    return { brand: sizing.brand || '', type, size: String(answer.sizeBought), fit: FIT_OF[answer.outcome], fromFeedback: true };
  }

  // What leaves the browser: the item, the size suggested and bought, the verdict and the areas.
  // A field-for-field whitelist, so a measurement on the sizing can never travel.
  function outcomeBody(sizing, answer, install) {
    if (!answer || !answer.sizeBought || !OUTCOMES.includes(answer.outcome)) return null;
    const kind = kindOf(sizing.kind);
    if (!kind) return null;
    return {
      item_key: String(sizing.itemKey || '').slice(0, 200),
      brand: String(sizing.brand || '').slice(0, 80),
      kind,
      shop: String(sizing.shop || '').toLowerCase(),
      install,
      size_bought: String(answer.sizeBought).slice(0, 20),
      size_suggested: String(sizing.size || '').slice(0, 20),
      outcome: answer.outcome,
      areas: answer.outcome === 'right' ? [] : [...new Set((answer.areas || []).filter((a) => AREAS.includes(a)))],
      chart_tier: Number.isInteger(sizing.tier) ? sizing.tier : null,
      learned_step: [-1, 0, 1].includes(sizing.learned) ? sizing.learned : 0,
    };
  }

  // The sizing kept for a product page Sizer answered. Stays in local storage; only outcomeBody's
  // fields of it ever travel, and only after an answer.
  function sizingFrom(product, result, itemKey, shop, now) {
    if (!itemKey || !result || !result.ok || !result.size) return null;
    const kind = result.shoes ? 'shoes' : kindOf(result.kind);
    if (!kind) return null;
    const tier = result.source && Number.isInteger(result.source.tier) ? result.source.tier : null;
    const sizes = ((product && product.sizes) || []).map((s) => String(s.label || '').trim()).filter(Boolean).slice(0, 30);
    return {
      itemKey,
      brand: String((product && product.brand) || '').trim().slice(0, 80),
      style: String((product && product.title) || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      kind,
      type: typeOf(product && product.title, kind),
      shop: String(shop || '').toLowerCase(),
      size: String(result.size),
      tier,
      learned: [-1, 0, 1].includes(result.learnedStep) ? result.learnedStep : 0,
      sizes,
      at: now,
    };
  }

  // An answer, applied: the sizing marked answered, the piece added to (or updated in) the profile,
  // and the anonymous body to send. Null when the item is unknown or the answer incomplete.
  function applyAnswer(list, profile, itemKey, answer, install, now) {
    const sizing = (list || []).find((s) => s.itemKey === itemKey);
    if (!sizing) return null;
    const anchor = toAnchor(sizing, answer || {});
    const body = outcomeBody(sizing, answer, install);
    if (!anchor || !body) return null;
    const anchors = ((profile && profile.anchors) || []).slice();
    const same = (a) => a.fromFeedback && String(a.brand).toLowerCase() === anchor.brand.toLowerCase() && a.type === anchor.type && String(a.size) === anchor.size;
    const at = anchors.findIndex(same);
    if (at >= 0) anchors[at] = { ...anchors[at], fit: anchor.fit };
    else anchors.push(anchor);
    return {
      list: list.map((s) => (s.itemKey === itemKey ? { ...s, answered: now, outcome: answer.outcome } : s)),
      profile: { ...profile, anchors },
      body,
    };
  }

  function dismiss(list, itemKey) {
    return (list || []).map((s) => (s.itemKey === itemKey ? { ...s, dismissed: true } : s));
  }

  // Outcomes that could not be sent wait here (local storage) for the next try: one per item, the
  // newest 20 at most, so an offline week never grows without bound.
  const OUTBOX_MAX = 20;
  function enqueue(outbox, body) {
    if (!body) return outbox || [];
    return [body, ...(outbox || []).filter((b) => b.item_key !== body.item_key)].slice(0, OUTBOX_MAX);
  }

  const api = { remember, due, askOnRevisit, toAnchor, outcomeBody, typeOf, areasFor, sizingFrom, applyAnswer, dismiss, enqueue, ASK_AFTER_DAYS, AREAS, KINDS, OUTCOMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SizerFeedback = api;
})(globalThis);
