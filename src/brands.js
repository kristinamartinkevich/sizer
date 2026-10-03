// Women's size charts, as BODY measurements in cm (the body each size is cut for).
// Compiled from brand size guides and widely reported fit reputations. Brands
// revise charts, so treat every number as approximate; `guide` says where to verify.
(function (root) {
  const IN = 2.54;

  // Denim waist sizing: size N fits a body waist of (N + w) inches and hip of (N + h) inches.
  function denim(min, max, w, h) {
    const out = [];
    for (let n = min; n <= max; n++) {
      out.push({ label: String(n), value: n, waist: +((n + w) * IN).toFixed(1), hip: +((n + h) * IN).toFixed(1) });
    }
    return out;
  }

  function table(rows) {
    return rows.map(([value, waist, hip]) => ({ label: String(value), value, waist, hip }));
  }

  const GENERIC = {
    denim: denim(22, 40, 0.5, 10.5),
    eu: table([[30, 56, 84], [32, 60, 88], [34, 64, 91], [36, 68, 94], [38, 72, 97], [40, 76, 100], [42, 81, 104], [44, 86, 108], [46, 92, 113], [48, 98, 118], [50, 104, 123]]),
    letter: [
      { label: 'XXS', value: 'XXS', waist: 60, hip: 86 },
      { label: 'XS', value: 'XS', waist: 64, hip: 90 },
      { label: 'S', value: 'S', waist: 68, hip: 94 },
      { label: 'M', value: 'M', waist: 73, hip: 99 },
      { label: 'L', value: 'L', waist: 79, hip: 104 },
      { label: 'XL', value: 'XL', waist: 85, hip: 110 },
      { label: 'XXL', value: 'XXL', waist: 92, hip: 116 },
      { label: '3XL', value: '3XL', waist: 99, hip: 122 },
    ],
  };

  // Other numeric systems convert to EU before lookup.
  // US women's numeric: 0 = EU 32, 2 = EU 34, 4 = EU 36 ... (EU = US + 32).
  const TO_EU = {
    us: (v) => (v === '00' ? 30 : Number(v) + 32),
    uk: (v) => Number(v) + 28,
    it: (v) => Number(v) - 4,
    fr: (v) => Number(v),
  };

  const BRANDS = [
    // Denim-sized brands (waist sizes 23–34)
    { id: 'rag-bone', name: 'rag & bone', aliases: ['rag & bone', 'rag and bone', 'rag&bone', 'ragbone', 'rag bone'], system: 'denim', sizes: denim(23, 33, 0.5, 10.5), tendency: 0, note: 'Stretch styles are true to size; rigid 100% cotton styles fit closer.', guide: 'rag-bone.com size guide' },
    { id: 'levis', name: "Levi's", aliases: ["levi's", 'levis', 'levi strauss'], system: 'denim', sizes: denim(23, 34, 1, 11), tendency: 0, note: 'Rigid styles (501, Ribcage, Wedgie) fit snug through the hip.', guide: 'levi.com size chart' },
    { id: 'agolde', name: 'AGOLDE', aliases: ['agolde', 'a gold e'], system: 'denim', sizes: denim(23, 34, 0.5, 10.5), tendency: 0.25, note: 'Mostly rigid cotton; shoppers often size up in vintage-inspired fits.', guide: 'agolde.com size guide' },
    { id: 'redone', name: 'RE/DONE', aliases: ['re/done', 'redone', 're done'], system: 'denim', sizes: denim(23, 32, 0.5, 10), tendency: 0.5, note: 'Vintage-cut rigid denim, widely reported to run small.', guide: 'shopredone.com size guide' },
    { id: 'citizens', name: 'Citizens of Humanity', aliases: ['citizens of humanity', 'citizens'], system: 'denim', sizes: denim(23, 34, 0.5, 10.5), tendency: 0, note: '', guide: 'citizensofhumanity.com size guide' },
    { id: 'mother', name: 'MOTHER', aliases: ['mother denim', 'mother'], system: 'denim', sizes: denim(23, 34, 0.5, 10.5), tendency: 0, note: '', guide: 'motherdenim.com size guide' },
    { id: 'frame', name: 'FRAME', aliases: ['frame denim', 'frame'], system: 'denim', sizes: denim(23, 34, 0.5, 10.5), tendency: 0, note: '', guide: 'frame-store.com size guide' },
    { id: 'ag', name: 'AG Jeans', aliases: ['ag jeans', 'adriano goldschmied'], system: 'denim', sizes: denim(23, 34, 0.5, 10.5), tendency: 0, note: '', guide: 'agjeans.com size guide' },
    { id: 'paige', name: 'PAIGE', aliases: ['paige'], system: 'denim', sizes: denim(23, 34, 0.5, 10.5), tendency: 0, note: '', guide: 'paige.com size guide' },
    { id: '7fam', name: '7 for all mankind', aliases: ['7 for all mankind', 'seven for all mankind'], system: 'denim', sizes: denim(23, 34, 0.5, 10.5), tendency: 0, note: '', guide: '7forallmankind.com size guide' },
    { id: 'madewell', name: 'Madewell', aliases: ['madewell'], system: 'denim', sizes: denim(23, 37, 1, 10.5), tendency: 0, note: '', guide: 'madewell.com size chart' },
    { id: 'abercrombie', name: 'Abercrombie & Fitch', aliases: ['abercrombie & fitch', 'abercrombie and fitch', 'abercrombie'], system: 'denim', sizes: denim(23, 37, 1, 11), tendency: 0, note: '', guide: 'abercrombie.com size chart' },
    { id: 'acne', name: 'Acne Studios', aliases: ['acne studios', 'acne'], system: 'denim', sizes: denim(23, 34, 0.5, 10.5), tendency: 0, note: '', guide: 'acnestudios.com size guide' },
    { id: 'toteme', name: 'TOTEME', aliases: ['toteme', 'totême', 'totme'], system: 'denim', sizes: denim(23, 32, 0.5, 10.5), tendency: 0, note: '', guide: 'toteme-studio.com size guide' },
    { id: 'anine-bing', name: 'ANINE BING', aliases: ['anine bing'], system: 'denim', sizes: denim(23, 32, 0.5, 10.5), tendency: 0, note: '', guide: 'aninebing.com size guide' },
    { id: 'khaite', name: 'KHAITE', aliases: ['khaite'], system: 'denim', sizes: denim(23, 32, 0.5, 10.5), tendency: 0, note: '', guide: 'khaite.com size guide' },
    { id: 'weekday', name: 'Weekday', aliases: ['weekday'], system: 'denim', sizes: denim(23, 36, 0.5, 10.5), tendency: 0.25, note: 'Often reported to run small in the waist.', guide: 'weekday.com size guide' },
    ...['Tommy Jeans', 'Calvin Klein Jeans', 'G-Star RAW', 'Diesel', 'Pepe Jeans', 'Lee', 'Wrangler', 'ONLY', 'Vero Moda', 'Pieces', 'Noisy May', 'Mavi', 'Dr. Denim'].map((name) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, aliases: [name.toLowerCase()], system: 'denim', sizes: denim(23, 36, 0.5, 10.5), tendency: 0, note: '', guide: 'brand size guide',
    })),

    // EU-sized high-street brands (letters convert through the same table)
    { id: 'zara', name: 'Zara', aliases: ['zara'], system: 'eu', sizes: table([[32, 58, 86], [34, 62, 90], [36, 66, 94], [38, 70, 97], [40, 74, 101], [42, 79, 106], [44, 85, 112]]), letters: { 32: 'XXS', 34: 'XS', 36: 'S', 38: 'M', 40: 'L', 42: 'XL', 44: 'XXL' }, tendency: 0, note: 'Cut small compared with most EU brands.', guide: 'zara.com size guide' },
    { id: 'pull-bear', name: 'Pull&Bear', aliases: ['pull&bear', 'pull and bear', 'pull & bear'], system: 'eu', sizes: table([[32, 58, 85], [34, 62, 89], [36, 66, 93], [38, 70, 97], [40, 74, 101], [42, 79, 106]]), tendency: 0, note: 'Cut small.', guide: 'pullandbear.com size guide' },
    { id: 'bershka', name: 'Bershka', aliases: ['bershka'], system: 'eu', sizes: table([[32, 58, 85], [34, 62, 89], [36, 66, 93], [38, 70, 97], [40, 74, 101], [42, 79, 106]]), tendency: 0, note: 'Cut small.', guide: 'bershka.com size guide' },
    { id: 'stradivarius', name: 'Stradivarius', aliases: ['stradivarius'], system: 'eu', sizes: table([[32, 58, 85], [34, 62, 89], [36, 66, 93], [38, 70, 97], [40, 74, 101], [42, 79, 106]]), tendency: 0, note: 'Cut small.', guide: 'stradivarius.com size guide' },
    { id: 'massimo-dutti', name: 'Massimo Dutti', aliases: ['massimo dutti'], system: 'eu', sizes: table([[32, 61, 88], [34, 65, 92], [36, 69, 96], [38, 73, 100], [40, 77, 104], [42, 82, 109]]), tendency: 0, note: '', guide: 'massimodutti.com size guide' },
    { id: 'mango', name: 'Mango', aliases: ['mango'], system: 'eu', sizes: table([[32, 60, 87], [34, 64, 91], [36, 68, 95], [38, 72, 99], [40, 76, 103], [42, 80, 107], [44, 86, 112]]), tendency: 0, note: '', guide: 'mango.com size guide' },
    { id: 'hm', name: 'H&M', aliases: ['h&m', 'h & m', 'hm', 'h and m'], system: 'eu', sizes: table([[32, 62, 88], [34, 66, 92], [36, 70, 96], [38, 74, 100], [40, 78, 104], [42, 82, 108], [44, 88, 114]]), tendency: 0, note: '', guide: 'hm.com size guide' },
    { id: 'cos', name: 'COS', aliases: ['cos'], system: 'eu', sizes: table([[32, 62, 88], [34, 66, 92], [36, 70, 96], [38, 74, 100], [40, 78, 104], [42, 83, 108]]), tendency: 0, note: '', guide: 'cos.com size guide' },
    { id: 'arket', name: 'ARKET', aliases: ['arket'], system: 'eu', sizes: table([[32, 62, 88], [34, 66, 92], [36, 70, 96], [38, 74, 100], [40, 78, 104], [42, 83, 108]]), tendency: 0, note: '', guide: 'arket.com size guide' },
    { id: 'other-stories', name: '& Other Stories', aliases: ['& other stories', 'and other stories', 'other stories'], system: 'eu', sizes: table([[32, 62, 88], [34, 66, 92], [36, 70, 96], [38, 74, 100], [40, 78, 104], [42, 83, 108]]), tendency: 0, note: '', guide: 'stories.com size guide' },
  ];

  const api = { BRANDS, GENERIC, TO_EU, IN };
  root.SizerBrands = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
