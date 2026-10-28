/** The starting zoom for a view this many degrees across (the larger of its height and its cosine-scaled width). */
export function zoomForSpan(span: number): number {
  return span > 3 ? 7 : span > 1.5 ? 8 : span > 0.7 ? 9 : span > 0.35 ? 10 : 11;
}
