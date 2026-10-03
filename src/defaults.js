(function (root) {
  // waist and hip are stored in cm, inseam in inches (it matches L30-style labels).
  root.SIZER_DEFAULT_PROFILE = {
    anchors: [
      { brand: 'Zara', type: 'jeans', size: '38', fit: 'perfect' },
      { brand: '', type: 'jeans', size: '27', fit: 'perfect' },
    ],
    waist: '',
    hip: '',
    inseam: '',
    unit: 'cm',
    fitPreference: 'regular',
  };
})(globalThis);
