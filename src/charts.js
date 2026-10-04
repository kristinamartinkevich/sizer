// Turns the downloaded chart bundle into the shape the engine reads: one brand with the
// right chart for the kind of item on the page, measurements in cm, suspect rows dropped.
(function (root) {
  const IN = 2.54;

  const SYSTEM = { denim_waist: 'denim', letter: 'letter', eu: 'eu', fr: 'eu', us: 'us', uk: 'uk', it: 'it' };

  // Which chart categories can answer for which kind of page, best first.
  const CHARTS_FOR = {
    bottoms: ['jeans', 'bottoms', 'trousers', 'general'],
    tops: ['tops', 'general', 'dresses'],
    dresses: ['dresses', 'general', 'tops'],
    shoes: ['shoes'],
  };

  // A chart that lists garment measurements is read as the body it fits, with a little ease taken off.
  const GARMENT_EASE_CM = { waist: 2, hip: 3 };

  const mid = (range) => (Array.isArray(range) && range.length ? (+range[0] + +range[range.length - 1]) / 2 : null);

  function sizeValue(label, system) {
    const s = String(label).trim().toUpperCase();
    if (system === 'letter') return s;
    if (s === '00') return '00';
    const n = parseFloat(s.replace(',', '.').replace(/\s?1\/2$|½$/, '.5'));
    return isFinite(n) ? n : s;
  }

  // Charts marked "mixed" print more than one system; the labels say which one leads.
  function inferSystem(rows) {
    const labels = rows.map((r) => String(r.label).toUpperCase());
    if (labels.every((l) => /^[0-9]/.test(l))) {
      const nums = labels.map(parseFloat);
      if (nums.some((n) => n % 2 === 1) && nums.every((n) => n >= 22 && n <= 40)) return 'denim';
      return nums.every((n) => n <= 24) ? 'us' : 'eu';
    }
    return 'letter';
  }

  function convertChart(chart) {
    const scale = chart.unit === 'in' ? IN : 1;
    const garment = chart.measurement_basis === 'garment';
    const system = SYSTEM[chart.size_system] || inferSystem(chart.rows || []);
    const shoes = chart.category === 'shoes';
    const rows = [];
    for (const r of chart.rows || []) {
      if (r.suspect) continue;
      const row = { label: String(r.label), value: sizeValue(r.label, system), aliases: r.aliases || {} };
      if (shoes) {
        if (!r.foot_length) continue;
        row.foot = [+r.foot_length[0] * scale, +r.foot_length[1] * scale];
        row.footMid = mid(row.foot);
      } else {
        const waist = mid(r.waist);
        const hip = mid(r.hip);
        if (waist == null || hip == null) continue;
        row.waist = +(waist * scale - (garment ? GARMENT_EASE_CM.waist : 0)).toFixed(1);
        row.hip = +(hip * scale - (garment ? GARMENT_EASE_CM.hip : 0)).toFixed(1);
      }
      rows.push(row);
    }
    if (rows.length < 2) return null;
    return { id: chart.id, category: chart.category, system, garment, shoes, rows, fitAdvice: chart.fit_advice || null, source: { url: chart.source_url, archiveUrl: chart.source_archive_url || null, retrievedOn: chart.retrieved_on || null } };
  }

  function pickChart(entry, kind) {
    const order = CHARTS_FOR[kind] || CHARTS_FOR.bottoms;
    for (const category of order) {
      for (const c of entry.charts || []) {
        if (c.category !== category) continue;
        const converted = convertChart(c);
        if (converted) return converted;
      }
    }
    return null;
  }

  // The brand's own fit note for this kind of item, if the research recorded one.
  function fitNote(entry, kind) {
    const notes = entry.fitNotes || [];
    const match = notes.find((n) => n.category && (CHARTS_FOR[kind] || []).includes(n.category)) || notes.find((n) => !n.category);
    return match ? { tendency: +match.tendency || 0, note: match.note || '' } : { tendency: 0, note: '' };
  }

  // An engine brand built from the bundle, or null when the brand has no usable chart for this kind of item.
  function toBrand(entry, kind) {
    const chart = pickChart(entry, kind);
    if (!chart) return null;
    const { tendency, note } = fitNote(entry, kind);
    return {
      id: entry.id,
      name: entry.name,
      aliases: entry.aliases && entry.aliases.length ? entry.aliases : [entry.name],
      system: chart.system,
      sizes: chart.rows,
      garment: chart.garment,
      shoes: chart.shoes,
      tendency,
      note,
      guide: null,
      source: { name: entry.name, ...chart.source },
      fromBundle: true,
    };
  }

  // Standard women's EU shoe sizes as foot length in cm, for brands without a chart of their own.
  const GENERIC_SHOES = [];
  for (let eu = 35; eu <= 43; eu++) {
    const m = +(eu * 2 / 3 - 1.2).toFixed(2);
    GENERIC_SHOES.push({ label: String(eu), value: eu, foot: [+(m - 0.33).toFixed(2), +(m + 0.33).toFixed(2)], footMid: m, aliases: { uk: String(eu - 33), us: String(eu - 30.5) } });
  }

  const api = { toBrand, convertChart, pickChart, GENERIC_SHOES, CHARTS_FOR };
  root.SizerCharts = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
