/**
 * The guarded view of an exposure map: the rules the twin's block page applies on top of the
 * exposure engine (Coffee-estate-twin public/wsb-map.js `analyse`, mode 'guarded'), plus the two
 * display rules of its current version:
 *
 *   heat        a surface-temperature component is dropped when the farm covers fewer than
 *               GUARDED.heatMinPixels Landsat pixels (one pixel would rank cells by its edges)
 *   combined    the kept components' per-cell scores averaged equally
 *   scale       colours stretched to the 250 m context's P10–P90 of that score, not the farm's own,
 *               so a farm that barely varies reads as a flat tone instead of full contrast
 *   contrast    a farm whose cells span less than GUARDED.contrastGate is one unit: nothing ranked
 *   mask        cells the satellite worker classed as water, flooded paddy or built-up / bare
 *               ground (`cover`, from ESA WorldCover, the season's own scene classes and a Sentinel-1
 *               season; agricentral-satellite app/geo/cover.py) are not coffee: they are not
 *               coloured, ranked or grouped. Open ground otherwise scores as "canopy openness" and
 *               pulls hotspots onto roofs, yards, ponds and paddy fields. Low NDVI alone never masks a cell, so sparse or pruned coffee stays
 *               ranked; a farm whose composites predate `cover` is not masked at all.
 *   bands       high = top third of the scale, moderate = middle, low = bottom; low is hidden
 *
 * Nothing here detects a pest; it marks where the conditions associated with it coincide.
 */
import { displayColour } from '../models/cwsb-model';

export const GUARDED = { contrastGate: 0.15, heatMinPixels: 4, maskCover: true, hideLow: true };

/** What a masked cell is, as the satellite worker classed it. */
export type Cover = 'water' | 'paddy' | 'built';
const COVERS: Cover[] = ['water', 'paddy', 'built'];

export type Band = 'high' | 'moderate' | 'low';
export const bandOf = (d: number): Band => (d >= 2 / 3 ? 'high' : d >= 1 / 3 ? 'moderate' : 'low');

export interface ExposureCell {
  i: number;
  row: number;
  col: number;
  lon: number;
  lat: number;
  zoneId?: string | null;
  parts?: Record<string, number | null>;
  raws?: Record<string, number | null>;
  /** Water or built-up / bare ground, with the evidence; absent or null for vegetation. */
  cover?: Cover | null;
  coverReason?: string | null;
}

export interface ExposureLike {
  components: { key: string; source: string; available: boolean }[];
  grid: { width: number; height: number; resolution?: number; cells: ExposureCell[] };
}

export interface GuardedCell extends ExposureCell {
  /** Equal mean of the kept components' scores (unclipped, used for ranking). */
  score: number;
  /** Score on the 250 m context's P10–P90 scale, 0–1. */
  display: number;
  band: Band;
  colour: string;
}

export interface GuardedView {
  kept: string[];
  heatDropped: boolean;
  scale: { low: number; high: number };
  /** P10–P90 spread of the score inside the farm; below the gate the farm is one unit. */
  spread: number;
  gated: boolean;
  /** Cells inside the farm with a score, after the water / paddy / built-up mask (every band). */
  inside: GuardedCell[];
  /** The cells to draw: inside, unmasked, and not low when low is hidden. Empty when gated. */
  shown: GuardedCell[];
  /** The strongest shown cells, ranked by unclipped score. */
  stops: GuardedCell[];
  /** Cells inside the farm masked as water, paddy or built-up / bare ground; drawn as the photo shows them. */
  notCoffee: ExposureCell[];
  /** Masked cells by kind. */
  masked: Record<Cover, number>;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** P10–P90 by nearest rank, as the twin page computes it. */
export function percentileRange(values: (number | null | undefined)[], p: [number, number] = [10, 90]) {
  const v = values.filter(finite).sort((a, b) => a - b);
  if (!v.length) return { low: 0, high: 1, fromData: false };
  const at = (q: number) => v[Math.min(v.length - 1, Math.max(0, Math.round((q / 100) * (v.length - 1))))];
  return { low: at(p[0]), high: at(p[1]), fromData: true };
}

function ringAreaM2(ring: number[][], lat0: number): number {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111320;
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    s += bx * kx * (ay * ky) - ax * kx * (by * ky);
  }
  return Math.abs(s) / 2;
}

/** Polygon area of the farm's zones (outer rings minus holes), in m². */
export function farmAreaM2(zones: { rings: number[][][] }[], lat0: number): number {
  return zones.reduce((acc, z) => acc + z.rings.reduce((a, r, i) => a + (i ? -1 : 1) * ringAreaM2(r, lat0), 0), 0);
}

export interface GuardedInput {
  exposure: ExposureLike;
  /** Farm polygon area in m² (see farmAreaM2). */
  farmM2: number;
  /** Landsat composite resolution in metres. */
  lstResolution?: number;
  /** Only these zones; empty or missing means the whole farm. */
  zoneIds?: string[];
  options?: Partial<typeof GUARDED>;
}

export function guardedExposure(input: GuardedInput): GuardedView {
  const o = { ...GUARDED, ...(input.options ?? {}) };
  const e = input.exposure, cells = e.grid.cells;
  const available = e.components.filter((k) => k.available);
  let kept = available.map((k) => k.key), heatDropped = false;

  // Heat: below the sensor's scale a Landsat component ranks cells by pixel boundaries.
  const lstRes = input.lstResolution || 100, minM2 = o.heatMinPixels * lstRes * lstRes;
  const lstKeys = available.filter((k) => k.source === 'lst').map((k) => k.key);
  if (lstKeys.length && input.farmM2 < minM2) {
    kept = kept.filter((k) => !lstKeys.includes(k));
    heatDropped = true;
  }

  const combined = new Map<number, number | null>(
    cells.map((c) => {
      const parts = kept.map((k) => c.parts?.[k]).filter(finite);
      return [c.i, parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null];
    }),
  );
  // Colours relative to the 250 m surroundings (every cell of the buffered grid), not the farm.
  const scale = percentileRange([...combined.values()]);
  const span = Math.max(scale.high - scale.low, 1e-4);

  const zoneFilter = new Set(input.zoneIds ?? []);
  const inFarm = cells.filter((c) => c.zoneId && (!zoneFilter.size || zoneFilter.has(c.zoneId)) && finite(combined.get(c.i)));
  const isNotCoffee = (c: ExposureCell) => o.maskCover && !!c.cover && COVERS.includes(c.cover);
  const inside: GuardedCell[] = inFarm
    .filter((c) => !isNotCoffee(c))
    .map((c) => {
      const score = combined.get(c.i) as number, display = clamp01((score - scale.low) / span);
      return { ...c, score, display, band: bandOf(display), colour: displayColour(display) };
    });

  // Contrast gate on the farm's own spread, measured over every cell inside (as the twin does).
  const insideRange = percentileRange(inFarm.map((c) => combined.get(c.i)));
  const spread = insideRange.fromData ? insideRange.high - insideRange.low : 0;
  const gated = spread < o.contrastGate;

  const shown = gated ? [] : inside.filter((c) => !o.hideLow || c.band !== 'low');
  const stops = [...shown].sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 5);
  const notCoffee = inFarm.filter(isNotCoffee);
  const masked = Object.fromEntries(COVERS.map((k) => [k, notCoffee.filter((c) => c.cover === k).length])) as Record<Cover, number>;
  return { kept, heatDropped, scale: { low: scale.low, high: scale.high }, spread, gated, inside, shown, stops, notCoffee, masked };
}
