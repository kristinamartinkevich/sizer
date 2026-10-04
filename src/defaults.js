(function (root) {
  // Starts empty so a new install asks for sizes instead of guessing.
  // waist, hip and foot length are stored in cm, inseam in inches (it matches L30-style labels).
  root.SIZER_DEFAULT_PROFILE = {
    anchors: [],
    waist: '',
    hip: '',
    inseam: '',
    footLength: '',
    unit: 'cm',
    fitPreference: 'regular',
  };
})(globalThis);
