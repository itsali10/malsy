/** Derive lesson video filename from unit id, e.g. history_g6:unit_01 → history_g6_unit_01.mp4 */
export function unitVideoFilename(unitId: string): string {
  return unitId.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mp4';
}
