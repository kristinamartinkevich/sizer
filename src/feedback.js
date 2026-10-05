(function (root) {
  // "You bought it, did it fit?" Pure helpers for the recent-sizings list kept in local storage, the
  // question's timing, and what an answer turns into: a piece you own (local) and an anonymous
  // outcome (sent). No DOM, no chrome.

  const DAY = 24 * 60 * 60 * 1000;
  const KEEP = 50;
  const KEEP_DAYS = 60;
  const ASK_AFTER_DAYS = 7;

  // Adds or refreshes one sizing, newest first, dropping the oldest and anything past 60 days.
  function remember(list, sizing, now) {
    const rest = (list || []).filter((s) => s.itemKey !== sizing.itemKey && now - s.at <= KEEP_DAYS * DAY);
    return [sizing, ...rest].sort((a, b) => b.at - a.at).slice(0, KEEP);
  }

  // Sizings a week old or more that have not been answered or dismissed.
  function due(list, now) {
    return (list || []).filter((s) => !s.answered && !s.dismissed && now - s.at >= ASK_AFTER_DAYS * DAY);
  }

  // Coming back to a product sized before is the best moment to ask, whatever its age.
  function askOnRevisit(list, itemKey) {
    return (list || []).find((s) => s.itemKey === itemKey && !s.answered && !s.dismissed) || null;
  }

  const FIT_OF = { small: 'tight', right: 'perfect', big: 'loose' };
  const OUTCOMES = Object.keys(FIT_OF);
  const AREAS = ['bust', 'chest', 'waist', 'hip', 'length', 'inseam', 'shoulder', 'sleeve', 'foot'];

  function toAnchor(sizing, answer) {
    if (!sizing.kind || !answer.sizeBought || !FIT_OF[answer.outcome]) return null;
    return { brand: sizing.brand || '', type: sizing.kind, size: String(answer.sizeBought), fit: FIT_OF[answer.outcome], fromFeedback: true };
  }

  // What leaves the browser: the item, the size suggested and bought, the verdict and the areas.
  // A field-for-field whitelist, so a measurement on the sizing can never travel.
  function outcomeBody(sizing, answer, install) {
    if (!answer || !answer.sizeBought || !OUTCOMES.includes(answer.outcome)) return null;
    return {
      item_key: String(sizing.itemKey || '').slice(0, 200),
      brand: String(sizing.brand || '').slice(0, 80),
      kind: sizing.kind || null,
      shop: String(sizing.shop || '').toLowerCase(),
      install,
      size_bought: String(answer.sizeBought).slice(0, 20),
      size_suggested: String(sizing.size || '').slice(0, 20),
      outcome: answer.outcome,
      areas: (answer.areas || []).filter((a) => AREAS.includes(a)),
      chart_tier: Number.isInteger(sizing.tier) ? sizing.tier : null,
    };
  }

  const api = { remember, due, askOnRevisit, toAnchor, outcomeBody, ASK_AFTER_DAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SizerFeedback = api;
})(globalThis);
