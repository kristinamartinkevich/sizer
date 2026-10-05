(function (root) {
  // Vinted listings: one size, no reviews, and measurements only when the seller wrote them. This
  // file reads those measurements and writes the message that asks for the missing ones. Pure: no
  // DOM, no chrome, so node --test covers it.

  // Longest labels first within each kind, and inseam before length, so "Innenbeinlänge" is never
  // read as a length. Every value is stored as a flat width or a length, in cm.
  const LABELS = [
    ['inseam', 'entrejambe|inseam|inside leg|innenbeinlänge|schrittlänge|entrepierna|cavallo interno|binnenbeenlengte|długość nogawki od kroku|długość wewnętrzna'],
    ['rise', 'hauteur de fourche|fourche|rise|leibhöhe|tiro|kruishoogte|stan'],
    ['legOpening', 'bas de jambe|leg opening|saumweite|bajo de la pierna|fondo gamba|pijpwijdte|szerokość nogawki'],
    ['sleeve', 'longueur de manches?|manches?|sleeve length|sleeve|ärmellänge|ärmel|largo de manga|manga|lunghezza manica|manica|mouwlengte|mouw|długość rękawa|rękaw'],
    ['shoulder', 'largeur d.épaules|épaules|shoulder width|shoulders?|schulterbreite|schulter|ancho de hombros|hombros|larghezza spalle|spalle|schouderbreedte|schouders|szerokość ramion|ramiona'],
    ['insole', 'semelle intérieure|insole|innensohle|plantilla|soletta|binnenzool|wkładka'],
    ['pit', "d.aisselle à aisselle|aisselle à aisselle|armpit to armpit|pit to pit|p2p|achsel zu achsel|axila a axila|ascella a ascella|ascella ascella|oksel tot oksel|pod pachami|pacha pacha|largeur poitrine|chest flat|chest|brustweite|poitrine"],
    ['waistFlat', 'tour de taille|taille à plat|largeur taille|waist|bundweite|taillenweite|cintura|vita|taillewijdte|tailleomvang|pas'],
    ['length', 'longueur totale|longueur|total length|length|gesamtlänge|länge|largo total|largo|lunghezza totale|lunghezza|totale lengte|lengte|długość całkowita|długość'],
  ];
  const NUM = '(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*(cm|inches|inch|in\\b|"|”|\'\')?';
  const PATTERNS = LABELS.map(([key, words]) => [key, new RegExp(`(?<![\\p{L}])(?:${words})(?![\\p{L}])([^\\d\\n]{0,20}?)${NUM}`, 'giu')]);
  // A waist or chest at least this wide is a circumference, so it is halved to a flat width.
  const ROUND_FROM_CM = { waistFlat: 55, pit: 70 };
  const round1 = (v) => Math.round(v * 10) / 10;
  // What a flat width or length can plausibly be, in cm, after any halving. Outside it, the number
  // belongs to something else ("pas de défaut, porté 2 fois").
  const RANGE = { waistFlat: [20, 80], pit: [25, 80], length: [15, 150], inseam: [40, 100], rise: [15, 45], legOpening: [8, 45], shoulder: [25, 60], sleeve: [25, 95], insole: [15, 33] };

  function parseMeasurements(text) {
    let rest = String(text || '');
    const out = {};
    for (const [key, re] of PATTERNS) {
      re.lastIndex = 0;
      rest = rest.replace(re, (whole, gap, num, unit) => {
        if (out[key] == null) {
          let v = parseFloat(num.replace(',', '.'));
          if (unit && !/cm/i.test(unit)) v *= 2.54;
          if (ROUND_FROM_CM[key] && v >= ROUND_FROM_CM[key] && !/flat|plat|flach|plano|piano|płasko/i.test(gap)) v /= 2;
          if (v >= RANGE[key][0] && v <= RANGE[key][1]) out[key] = round1(v);
        }
        return ' '.repeat(whole.length);
      });
    }
    return out;
  }

  const WANTED = {
    top: ['pit', 'length'],
    dress: ['pit', 'waistFlat', 'length'],
    jeans: ['waistFlat', 'rise', 'inseam', 'legOpening'],
    trousers: ['waistFlat', 'rise', 'inseam', 'legOpening'],
    shorts: ['waistFlat', 'rise', 'length'],
    skirt: ['waistFlat', 'length'],
    outerwear: ['pit', 'shoulder', 'sleeve', 'length'],
    shoes: ['insole'],
  };

  // The measurements worth asking for this kind of item, minus the ones the listing already gives.
  function wanted(kind, have) {
    return (WANTED[kind] || WANTED.top).filter((k) => !have || have[k] == null);
  }

  const NAMES = {
    en: { pit: 'armpit to armpit', length: 'total length', waistFlat: 'waist measured flat', rise: 'rise', inseam: 'inside leg', legOpening: 'leg opening', shoulder: 'shoulder width', sleeve: 'sleeve length', insole: 'insole length' },
    fr: { pit: 'aisselle à aisselle', length: 'longueur totale', waistFlat: 'tour de taille à plat', rise: 'hauteur de fourche', inseam: 'entrejambe', legOpening: 'largeur du bas de jambe', shoulder: 'largeur d’épaules', sleeve: 'longueur de manche', insole: 'longueur de semelle intérieure' },
    de: { pit: 'Achsel zu Achsel', length: 'Gesamtlänge', waistFlat: 'Bundweite flach gemessen', rise: 'Leibhöhe', inseam: 'Innenbeinlänge', legOpening: 'Saumweite', shoulder: 'Schulterbreite', sleeve: 'Ärmellänge', insole: 'Innensohlenlänge' },
    es: { pit: 'axila a axila', length: 'largo total', waistFlat: 'cintura en plano', rise: 'tiro', inseam: 'entrepierna', legOpening: 'bajo de la pierna', shoulder: 'ancho de hombros', sleeve: 'largo de manga', insole: 'largo de plantilla' },
    it: { pit: 'ascella ascella', length: 'lunghezza totale', waistFlat: 'vita in piano', rise: 'cavallo', inseam: 'cavallo interno', legOpening: 'fondo gamba', shoulder: 'larghezza spalle', sleeve: 'lunghezza manica', insole: 'lunghezza soletta' },
    nl: { pit: 'oksel tot oksel', length: 'totale lengte', waistFlat: 'taille plat gemeten', rise: 'kruishoogte', inseam: 'binnenbeenlengte', legOpening: 'pijpwijdte', shoulder: 'schouderbreedte', sleeve: 'mouwlengte', insole: 'binnenzoollengte' },
    pl: { pit: 'pacha pacha', length: 'długość całkowita', waistFlat: 'pas mierzony na płasko', rise: 'stan', inseam: 'długość nogawki od kroku', legOpening: 'szerokość nogawki na dole', shoulder: 'szerokość ramion', sleeve: 'długość rękawa', insole: 'długość wkładki' },
  };
  const AND = { en: 'and', fr: 'et', de: 'und', es: 'y', it: 'e', nl: 'en', pl: 'i' };
  const TEMPLATE = {
    en: (l) => `Hello, could you measure the ${l} for me, in cm? Thank you.`,
    fr: (l) => `Bonjour, pourriez-vous me donner ces mesures en cm : ${l} ? Merci beaucoup.`,
    de: (l) => `Hallo, könnten Sie bitte ${l} in cm messen? Vielen Dank.`,
    es: (l) => `Hola, ¿podrías medir ${l} en cm? Muchas gracias.`,
    it: (l) => `Ciao, potresti misurare ${l} in cm? Grazie mille.`,
    nl: (l) => `Hallo, zou je ${l} in cm kunnen meten? Alvast bedankt.`,
    pl: (l) => `Dzień dobry, czy można prosić o wymiary w cm: ${l}? Dziękuję.`,
  };

  function joinList(items, lang) {
    if (items.length < 2) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${AND[lang]} ${items[items.length - 1]}`;
  }

  // A short, polite message in the listing's language asking for what is missing, or null when
  // nothing is. Sizer copies it; it never sends anything on Vinted.
  function sellerMessage({ kind, lang, have }) {
    const l = NAMES[lang] ? lang : 'en';
    const keys = wanted(kind, have);
    if (!keys.length) return null;
    return TEMPLATE[l](joinList(keys.map((k) => NAMES[l][k]), l));
  }

  const LANG_OF_TLD = { fr: 'fr', be: 'fr', lu: 'fr', de: 'de', at: 'de', es: 'es', it: 'it', nl: 'nl', pl: 'pl' };
  function langOf(hostname) {
    const tld = String(hostname || '').toLowerCase().split('.').pop();
    return LANG_OF_TLD[tld] || 'en';
  }

  // ---- does it fit you --------------------------------------------------------

  // Listing measurement → the matching flat-lay field on a piece you own (C1's `flat`, in cm).
  const TO_PIECE = { pit: 'chest', waistFlat: 'waist', shoulder: 'shoulder', length: 'length', inseam: 'inseam', sleeve: 'sleeve' };
  const WIDTHS = ['chest', 'waist', 'shoulder'];
  const SAME_KIND = { jeans: ['jeans', 'trousers'], trousers: ['trousers', 'jeans'], shorts: ['shorts', 'jeans', 'trousers'] };
  // A piece marked a bit loose is about a size too wide for you, a bit tight about a size too narrow.
  const PIECE_FIT_CM = { loose: -2.5, tight: 2.5, perfect: 0 };
  const HEAD = { fits: 'Your size', small: 'Too small for you', roomy: 'Roomy on you' };

  function widthVerdict(d) { return d < -1.5 ? 'tight' : d > 2 ? 'roomy' : 'fine'; }
  function lengthVerdict(d) { return d < -2.5 ? 'short' : d > 2.5 ? 'long' : 'fine'; }

  function overall(areas) {
    return areas.some((a) => a.verdict === 'tight') ? 'small' : areas.some((a) => a.verdict === 'roomy') ? 'roomy' : 'fits';
  }

  function againstPiece(listing, piece) {
    const areas = [];
    for (const [from, to] of Object.entries(TO_PIECE)) {
      const v = listing.have[from];
      const own = piece.flat && piece.flat[to];
      if (v == null || own == null) continue;
      const width = WIDTHS.includes(to);
      const d = round1(v - (own + (width ? PIECE_FIT_CM[piece.fit] || 0 : 0)));
      areas.push({ area: to, diff: d, verdict: width ? widthVerdict(d) : lengthVerdict(d) });
    }
    return areas.some((a) => WIDTHS.includes(a.area)) ? areas : null;
  }

  // Body measurements against the garment's circumference (twice the flat width), with the ease a
  // top or a waistband usually has.
  function againstBody(listing, profile) {
    const areas = [];
    const bottoms = ['jeans', 'trousers', 'shorts', 'skirt'].includes(listing.kind);
    if (listing.have.pit != null && +profile.bust > 0) {
      const ease = listing.have.pit * 2 - profile.bust;
      areas.push({ area: 'chest', diff: round1(ease), verdict: ease < 2 ? 'tight' : ease > 16 ? 'roomy' : 'fine' });
    }
    if (listing.have.waistFlat != null && +profile.waist > 0) {
      const ease = listing.have.waistFlat * 2 - profile.waist - (bottoms ? 0 : 2);
      areas.push({ area: 'waist', diff: round1(ease), verdict: ease < -1 ? 'tight' : ease > 6 ? 'roomy' : 'fine' });
    }
    return areas.length ? areas : null;
  }

  const pieceName = (p) => [p.brand, p.type].filter(Boolean).join(' ') + (p.size ? ` in ${p.size}` : '');

  // The seller's measurements against the nearest piece you own of the same kind, else against your
  // measurements. Null when there is nothing to compare, so the label size is used instead.
  function compare(listing, profile) {
    const kinds = SAME_KIND[listing.kind] || [listing.kind];
    let best = null;
    for (const piece of (profile && profile.anchors) || []) {
      if (!kinds.includes(piece.type)) continue;
      const areas = againstPiece(listing, piece);
      if (!areas) continue;
      const score = areas.reduce((s, a) => s + Math.abs(a.diff), 0) / areas.length;
      if (!best || score < best.score) best = { piece, areas, score };
    }
    const areas = best ? best.areas : againstBody(listing, profile || {});
    if (!areas) return null;
    const verdict = overall(areas);
    const against = best ? pieceName(best.piece) : 'your measurements';
    return { verdict, against, areas, line: `${HEAD[verdict]}, compared with ${best ? `your ${against}` : against}` };
  }

  const api = { parseMeasurements, wanted, sellerMessage, langOf, compare, NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SizerVinted = api;
})(globalThis);
