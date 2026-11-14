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
 * The "Stops most often late" map's stop dot (CIV-1405): the regular map's stop dot, a little bigger so a handful of stops
 * can be found on a zoomed-out map, yet small enough that stops close together along a street stay apart, growing with
 * the zoom like the regular map's. Each dot takes its own colour (`color`: how often the stop is late, in the Live key's
 * colours) with an outline in the basemap's colour, so it stands out from the route lines under it.
 */
export function lateStopDotPaint(lightMode: boolean) {
  return {
    ...stopDotPaint(lightMode),
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 12, 3, 16, 6],
    'circle-color': ['get', 'color'],
    'circle-stroke-color': lightMode ? '#ffffff' : '#111827',
    'circle-opacity': 1,
    'circle-stroke-opacity': 1,
  } as const;
}
