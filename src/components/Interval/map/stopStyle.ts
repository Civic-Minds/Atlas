/**
 * How the map draws a stop: the regular map's stop dot (its `stops-layer`). Shared so every map that shows stops draws
 * them the same (CIV-1405); change it here and every map follows.
 */
export function stopDotPaint(lightMode: boolean) {
  const accent = lightMode ? '#3f3f46' : '#e4e4e7';
  const textDim = lightMode ? '#9ca3af' : 'rgba(255, 255, 255, 0.3)';
  const borderPrimary = lightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
  return {
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      12, 1.5,
      16, 4.5
    ],
    'circle-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], accent,
      textDim
    ],
    'circle-stroke-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], '#ffffff',
      borderPrimary
    ],
    'circle-stroke-width': 1,
    'circle-opacity': 0.75,
    'circle-stroke-opacity': 0.6
  } as const;
}

/**
 * CIV-1405 option 1: the regular map's stop dot, same colours and outline, drawn bigger so a handful of stops can be
 * found on a zoomed-out map.
 */
export function bigStopDotPaint(lightMode: boolean) {
  return { ...stopDotPaint(lightMode), 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 7] } as const;
}

/** The Live tool's route map stop dot: the stop's own colour (`color`), with a halo in the basemap's colour. */
export function liveStopDotPaint(lightMode: boolean) {
  return { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 6], 'circle-stroke-color': lightMode ? '#ffffff' : '#111827', 'circle-stroke-width': 1.5 } as const;
}
