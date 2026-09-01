/**
 * The register's scale.
 *
 * The bureau's projects run from 334 m² to 18,600 m² — a 55× range, and the most interesting
 * fact in its data. The first version of this site rendered that as a right-aligned caption
 * in 16px grey. Here it is the organising material: every frame in the index is drawn in
 * proportion to the building it shows, so the page states the range instead of mentioning it.
 *
 * Linear proportion would be useless — at 55× the smallest project becomes a postage stamp
 * beside the largest, and an index nobody can read is not an argument. Square root maps area
 * to a *linear dimension*, which is what the eye is actually comparing when it looks at two
 * rectangles, so the frames relate the way the buildings' plans would. The compression is
 * about 7.4× rather than 55×: still emphatic, still honest, still legible.
 *
 * The mapping is stated on the page. A figure drawn to a scale the reader cannot check is
 * decoration wearing the costume of data.
 */

const MIN_HEIGHT = 210;
const MAX_HEIGHT = 900;

export function heightForArea(area: number, areas: number[]): number {
  const roots = areas.map((value) => Math.sqrt(value));
  const low = Math.min(...roots);
  const high = Math.max(...roots);
  if (high === low) return MAX_HEIGHT;
  const t = (Math.sqrt(area) - low) / (high - low);
  return Math.round(MIN_HEIGHT + t * (MAX_HEIGHT - MIN_HEIGHT));
}

/** The same mapping on a phone, where the ceiling is a viewport rather than a grid row. */
export function mobileHeightForArea(area: number, areas: number[]): number {
  const roots = areas.map((value) => Math.sqrt(value));
  const low = Math.min(...roots);
  const high = Math.max(...roots);
  if (high === low) return 460;
  const t = (Math.sqrt(area) - low) / (high - low);
  return Math.round(200 + t * 380);
}
