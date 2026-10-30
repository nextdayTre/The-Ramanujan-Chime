/* ===== Harmony.views — Canonical View Surface Aggregator =====
   Ensures all modular view engines are registered on window.Harmony before
   js/app.js boots. Fails loudly with a clear console message if any script
   tag is missing. */
(function () {
  'use strict';

  window.Harmony = window.Harmony || { engine: {}, PRECISION: 'float32' };

  var required = [
    'engine',
    'Presets',
    'Scene3D',
    'Magnifier2D',
    'Lissajous2D',
    'TimeSeries',
    'Harmonics2D',
    'Frobenius'
  ];

  var missing = required.filter(function (k) { return !window.Harmony[k]; });
  if (missing.length) {
    window.__harmonyMissing = missing;
    console.error('[Harmony] missing view module(s): ' + missing.join(', '));
  }

  window.Harmony.views = [
    'Scene3D',
    'Magnifier2D',
    'Lissajous2D',
    'TimeSeries',
    'Harmonics2D',
    'Frobenius',
    'Presets'
  ];
})();
