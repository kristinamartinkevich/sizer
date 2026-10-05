(function (root) {
  // Starts empty so a new install asks for sizes instead of guessing.
  // Body measurements (bust, waist, hip, shoulder width, arm length, height, foot length) are stored in
  // cm, weight in kg, inseam in inches (it matches L30-style labels). Every one is optional.
  // Weight never sizes anything; it is kept only to compare you with reviewers.
  // fitByCategory: { bottoms, tops, dresses, outerwear }, each snug | regular | relaxed; a kind left
  // out uses fitPreference. betweenSizes: up | down | stretch (let the fabric decide).
  // Each piece you own may carry flat-lay measurements in cm, measured flat across:
  // flat: { waist, hip, chest, length, inseam, shoulder, sleeve }.
  root.SIZER_DEFAULT_PROFILE = {
    anchors: [],
    height: '',
    weight: '',
    bust: '',
    waist: '',
    hip: '',
    shoulder: '',
    armLength: '',
    inseam: '',
    footLength: '',
    unit: 'cm',
    fitPreference: 'regular',
    fitByCategory: {},
    betweenSizes: 'stretch',
    theme: 'system',
  };
})(globalThis);
