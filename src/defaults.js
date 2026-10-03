(function (root) {
  // Starts empty so a new install asks for sizes instead of guessing.
  // waist and hip are stored in cm, inseam in inches (it matches L30-style labels).
  root.SIZER_DEFAULT_PROFILE = {
    anchors: [],
    waist: '',
    hip: '',
    inseam: '',
    unit: 'cm',
    fitPreference: 'regular',
  };
})(globalThis);
