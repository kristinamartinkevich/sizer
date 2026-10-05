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

  // A Vinted listing's address path; the catalogue, members and the rest are not listings.
  const isListingPath = (pathname) => /\/items\//.test(String(pathname || ''));

  const LANG_OF_TLD = { fr: 'fr', be: 'fr', lu: 'fr', de: 'de', at: 'de', es: 'es', it: 'it', nl: 'nl', pl: 'pl' };
  function langOf(hostname) {
    const tld = String(hostname || '').toLowerCase().split('.').pop();
    return LANG_OF_TLD[tld] || 'en';
  }

  // ---- does it fit you --------------------------------------------------------

  // Listing measurement → the matching flat-lay field on a piece you own (C1's `flat`, in cm).
  const TO_PIECE = { pit: 'chest', waistFlat: 'waist', shoulder: 'shoulder', length: 'length', inseam: 'inseam', sleeve: 'sleeve' };
  const WIDTHS = ['chest', 'waist', 'shoulder'];
  // The options page files coats under 'jacket', so a coat listing is compared with a jacket you own.
  const SAME_KIND = { jeans: ['jeans', 'trousers'], trousers: ['trousers', 'jeans'], shorts: ['shorts', 'jeans', 'trousers'], outerwear: ['jacket'] };
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
      // diff decides the verdict (it counts how your piece fits you); raw is what a tape measure would
      // show between the listing and your piece, so the words can state it truthfully.
      areas.push({ area: to, diff: d, raw: round1(v - own), verdict: width ? widthVerdict(d) : lengthVerdict(d) });
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
    const pieceFit = best && PIECE_FIT_CM[best.piece.fit] ? best.piece.fit : null;
    return { verdict, against, pieceFit, areas, line: `${HEAD[verdict]}, compared with ${best ? `your ${against}` : against}` };
  }

  // ---- where it fits, in words ----------------------------------------------------

  const AREA_WORD = { chest: 'chest', waist: 'waist', shoulder: 'shoulders', length: 'length', inseam: 'leg', sleeve: 'sleeves' };
  const VERDICT_WORD = { tight: 'Tight at the', roomy: 'Roomy at the', fine: 'Fine at the', short: 'Short in the', long: 'Long in the' };
  const BODY_PART = { chest: 'bust', waist: 'waist' };
  const cmText = (v) => `${+Math.abs(v).toFixed(1)} cm`;

  const FIT_NOTE = { loose: ', which fits you loose', tight: ', which is tight on you' };

  // One line per area compare() looked at: against a piece, how much narrower, wider, shorter or
  // longer the listing is, measured against the piece itself (when the piece fits you loose or tight,
  // the line says so, since that is why the same width can still be roomy or tight); against your
  // measurements, how much room it leaves.
  function areaLines(cmp) {
    if (!cmp || !Array.isArray(cmp.areas)) return [];
    const piece = cmp.against !== 'your measurements';
    return cmp.areas.map((a) => {
      const head = a.area === 'length' ? `${VERDICT_WORD[a.verdict].split(' ')[0]} in length` : `${VERDICT_WORD[a.verdict]} ${AREA_WORD[a.area] || a.area}`;
      if (!piece) {
        const part = BODY_PART[a.area] || a.area;
        return a.diff >= 0 ? `${head}, ${cmText(a.diff)} of room over your ${part}` : `${head}, ${cmText(a.diff)} less than your ${part}`;
      }
      const width = WIDTHS.includes(a.area);
      const d = typeof a.raw === 'number' ? a.raw : a.diff;
      const note = width && FIT_NOTE[cmp.pieceFit] ? FIT_NOTE[cmp.pieceFit] : '';
      if (!d) return `${head}, the same as yours${note}`;
      const word = width ? (d < 0 ? 'narrower' : 'wider') : (d < 0 ? 'shorter' : 'longer');
      return `${head}, ${cmText(d)} ${word} than yours${note}`;
    });
  }

  // ---- the label alone ----------------------------------------------------------------

  const COPY = {
    flag: 'Label only, the seller has not measured it',
    ask: 'Ask the seller to measure',
    copied: 'Copied',
    photos: 'Read measurements from the photos',
    fromPhoto: 'read from a photo',
  };

  // The engine's answer for a label alone: how many sizes the label sits from the one Sizer picks for
  // you (Engine.placeLabel), in words. Null when the label could not be placed.
  function labelResult(steps) {
    if (typeof steps !== 'number') return null;
    const verdict = steps === 0 ? 'fits' : steps < 0 ? 'small' : 'roomy';
    return { verdict, line: `${HEAD[verdict]} by the label`, flag: COPY.flag };
  }

  // ---- reading the listing --------------------------------------------------------------

  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const words = (list) => new RegExp(`(?<![\\p{L}])(?:${list})(?![\\p{L}])`, 'iu');
  // Most specific first: a denim jacket is a jacket, and a denim skirt or denim shorts are a skirt or
  // shorts, so skirt and shorts come before jeans. German and Dutch write them as one word
  // (Jeansrock, Jeansshorts, spijkerrok), so those words match as endings too.
  const KIND_WORDS = [
    ['shoes', words('chaussures?|shoes?|schuhe|zapatos|zapatillas|scarpe|schoenen|buty|baskets|sneakers?|trainers|bottes|bottines|boots?|stiefel|stiefeletten|botas|stivali|laarzen|sandales|sandals?|sandalen|sandalias|sandali|escarpins|heels|pumps|mocassins|loafers|ballerines|ballerinas|obuwie|kozaki|botki|sandały|calçado|skor|kengät|sko|topánky|cipők|pantofi|cipele|παπούτσια')],
    ['outerwear', words('manteaux?|vestes?|blousons?|parkas?|trench(?: ?coats?)?|doudounes?|coats?|jackets?|blazers?|outerwear|mäntel|mantel|jacken|jacke|abrigos?|chaquetas?|cazadoras?|cappotti|cappotto|giacche|giacca|giubbotti|jassen|jas|mantels|kurtki|kurtka|płaszcze|płaszcz|marynarki|casacos?|blusões|jackor|jacka|kappor|takit|takki|jakker|jakke|kabáty|bundy|kabátok|dzsekik|geci|jachete|paltoane|jakne|kaputi')],
    ['dress', words('robes?|dress(?:es)?|kleider|kleid|vestidos?|abiti|abito|jurken|jurk|sukienki|sukienka|klänningar|klänning|mekot|mekko|kjoler|kjole|šaty|ruhák|ruha|rochii|rochie|haljine|haljina|φορέματα')],
    ['skirt', words('jupes?|\\p{L}+röcke|\\p{L}+rock|\\p{L}+rokken|\\p{L}+rok|skirts?|röcke|rock|faldas?|gonne|gonna|rokken|rok|spódnice|spódnica|saias?|kjolar|kjol|hameet|hame|nederdele|nederdel|sukně|sukne|szoknyák|szoknya|fuste|fustă|suknje|suknja|φούστες')],
    ['shorts', words('shorts?|\\p{L}+shorts?|bermudas?|pantaloncini|korte broeken|szorty|calções|kraťasy|rövidnadrágok|pantaloni scurți|kratke hlače|σορτς')],
    ['jeans', words('jeans?|džíny|farmerky|farmer|dżinsy|blugi|traperice|τζιν')],
    ['trousers', words('pantalons?|trousers|pants|leggings|hosen|hose|pantalones|pantaloni|broeken|broek|spodnie|calças|byxor|housut|bukser|kalhoty|nohavice|nadrágok|nadrág|hlače|παντελόνια')],
    ['top', words('hauts?|tops?|t-shirts?|chemises?|chemisiers?|blouses?|pulls?|sweats?|gilets?|shirts?|sweaters?|jumpers?|hoodies?|cardigans?|oberteile|blusen|bluse|hemden|pullover|camisetas?|camisas?|blusas?|jerséis|maglie|maglia|magliette|camicie|camicia|bluse|felpe|truien|trui|bloesjes|overhemden|bluzki|bluzka|koszule|swetry|tröjor|toppar|paidat|topit|trøjer|toppe|trička|halenky|felsők|pólók|bluze|topuri|majice|μπλούζες')],
  ];

  function kindIn(text) {
    const t = clean(text);
    if (!t) return null;
    const hit = KIND_WORDS.find(([, re]) => re.test(t));
    return hit ? hit[0] : null;
  }

  // The kind of item from Vinted's category path, read from its most specific part up, else from
  // the title. A top when nothing says.
  function kindOfListing(parts, title) {
    const list = [].concat(parts || []).map(clean).filter(Boolean);
    for (let i = list.length - 1; i >= 0; i--) {
      const k = kindIn(list[i]);
      if (k) return k;
    }
    return kindIn(title) || 'top';
  }

  // A word src/engine.js's kindOf reads as the same kind, so the engine picks the right chart.
  const ENGINE_WORD = { top: 'top', dress: 'dress', jeans: 'jeans', trousers: 'trousers', shorts: 'shorts', skirt: 'skirt', outerwear: 'jacket', shoes: 'shoes' };
  const engineTitle = (kind) => ENGINE_WORD[kind] || 'top';

  const NO_SIZE = /^(?:taille unique|one size|einheitsgröße|talla única|taglia unica|one-size|onesize|universal|autre|other|andere|otro|altro|anders|inna|inny)$/i;

  // "M / 38 / 10" → "M": Vinted prints the letter, then the FR/EU and UK numbers; the first one is
  // what the engine reads. Null for one-size and "other".
  function sizeLabel(raw) {
    if (NO_SIZE.test(clean(raw))) return null;
    const s = clean(raw).replace(/^(?:taille|size|größe|grösse|talla|taglia|maat|rozmiar|tamanho|storlek|koko|størrelse|velikost|veľkosť|méret|mărime|veličina|μέγεθος)\s*:?\s*/i, '');
    if (!s || NO_SIZE.test(s)) return null;
    const first = clean(s.split(/[\/|]/)[0]);
    return first && !NO_SIZE.test(first) ? first.slice(0, 24) : null;
  }

  const CONDITION = { NewCondition: 'New', UsedCondition: 'Used', RefurbishedCondition: 'Refurbished', DamagedCondition: 'Damaged' };

  function ldText(v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return clean(v);
    if (Array.isArray(v)) return ldText(v[0]);
    if (typeof v === 'object') return clean(v.name || v.value || '');
    return '';
  }

  function ldImages(v) {
    return [].concat(v || []).map((x) => (typeof x === 'string' ? x : x && (x.url || x.contentUrl))).filter((x) => typeof x === 'string');
  }

  function httpsOnly(urls) {
    const out = [];
    for (const raw of urls) {
      let u;
      try { u = new URL(String(raw)); } catch { continue; }
      if (u.protocol !== 'https:') continue;
      u.hash = '';
      if (!out.includes(u.href)) out.push(u.href);
    }
    return out.slice(0, 8);
  }

  // One listing from what the page gave: its structured data (JSON-LD Product) first, the visible
  // details second. `raw` is { host, ld, brand, title, size, condition, category, description, photos },
  // every field but host optional, read by src/vinted-page.js.
  function listingFrom(raw) {
    const r = raw || {};
    const ld = r.ld && typeof r.ld === 'object' ? r.ld : {};
    const category = ldText(ld.category) ? ldText(ld.category).split(/\s*[>/›»]\s*/) : [].concat(r.category || []);
    const title = ldText(ld.name) || clean(r.title);
    const description = ldText(ld.description) || clean(r.description);
    const sizeRaw = ldText(ld.size) || clean(r.size);
    const schema = String(ldText(ld.itemCondition) || '').split('/').pop();
    return {
      brand: ldText(ld.brand) || clean(r.brand),
      title,
      sizeRaw,
      size: sizeLabel(sizeRaw),
      kind: kindOfListing(category, title),
      condition: clean(r.condition) || CONDITION[schema] || '',
      description,
      photos: httpsOnly(ldImages(ld.image).concat(r.photos || [])),
      lang: langOf(r.host),
      have: parseMeasurements(description),
    };
  }

  // What a photo read adds: only measurements the description did not give, and only plausible ones.
  function mergeMeasurements(have, read) {
    const out = { ...(have || {}) };
    const fromPhoto = [];
    for (const [k, v] of Object.entries(read || {})) {
      if (!RANGE[k] || out[k] != null || typeof v !== 'number' || v < RANGE[k][0] || v > RANGE[k][1]) continue;
      out[k] = round1(v);
      fromPhoto.push(k);
    }
    return { have: out, fromPhoto };
  }

  // ---- the answer -------------------------------------------------------------------------

  const hasProfile = (p) => !!p && ((+p.waist > 0 && +p.hip > 0) || +p.bust > 0 || +p.footLength > 0 || (Array.isArray(p.anchors) && p.anchors.length > 0));

  // What the Vinted line says, from the listing and your profile. The seller's measurements against
  // your pieces or body come first; else the label on the brand's chart through the engine (passed in,
  // so this stays pure), with the brand's tendency and pooled reviews in its reasons. The message asks
  // for whatever the listing leaves out, in every mode.
  function answerFor(listing, profile, charts, engine, poolFit) {
    const l = listing || {};
    const message = sellerMessage({ kind: l.kind, lang: l.lang, have: l.have });
    const cmp = compare({ kind: l.kind, have: l.have || {} }, profile);
    if (cmp) {
      return { mode: 'measured', verdict: cmp.verdict, line: cmp.line, areas: areaLines(cmp), against: cmp.against, byPiece: cmp.against !== 'your measurements', message };
    }
    if (!hasProfile(profile)) return { mode: 'needsProfile', message };
    if (l.size && engine) {
      const placed = engine.placeLabel(profile, { brand: l.brand, title: engineTitle(l.kind), text: l.description || '', label: l.size, poolFit }, charts);
      const r = placed.result;
      if (r && r.needsProfile) return { mode: 'needsProfile', message };
      if (r && r.ok) {
        const label = labelResult(placed.steps);
        return {
          mode: 'label',
          verdict: label ? label.verdict : null,
          line: label ? label.line : `Sizer would pick ${r.pickLabel} for you`,
          flag: COPY.flag,
          pick: r.pickLabel,
          // The brand's note is brand-level knowledge even when the engine had no reason to apply it.
          reasons: r.reasons.map((x) => x.text).concat(placed.brandNote && !r.reasons.some((x) => x.text === placed.brandNote) ? [placed.brandNote] : []),
          brandFact: engine.provenance(r).brandFact,
          message,
        };
      }
    }
    return { mode: 'unknown', message };
  }

  // The popup's heading over the listing's size, in the words the line uses: the size shown is the
  // seller's, so it is "Your size" only when the verdict says so, and a label-only fit is a rough guess.
  function popupHeading(verdict, confidence) {
    if (verdict === 'small' || verdict === 'roomy') return HEAD[verdict];
    return confidence === 'Low' || !verdict ? 'Rough guess' : HEAD.fits;
  }

  // The same answer in the popup's result shape. A measured answer against a piece you own is the
  // surest Sizer gives; against your measurements a notch less; the label alone is a rough guess.
  function popupResult(answer, listing) {
    if (!answer || (answer.mode !== 'measured' && answer.mode !== 'label')) return null;
    const confidence = answer.mode === 'label' ? 'Low' : answer.byPiece ? 'High' : 'Medium';
    const verdict = answer.verdict || null;
    return { ok: true, size: (listing && listing.size) || '', verdict, heading: popupHeading(verdict, confidence), headline: answer.line, confidence, brand: (listing && listing.brand) || null, available: null };
  }

  const api = {
    parseMeasurements, wanted, sellerMessage, langOf, compare, NAMES, RANGE, ROUND_FROM_CM, isListingPath,
    areaLines, labelResult, COPY, kindOfListing, engineTitle, sizeLabel, listingFrom, mergeMeasurements,
    answerFor, popupResult, hasProfile,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SizerVinted = api;
})(globalThis);
