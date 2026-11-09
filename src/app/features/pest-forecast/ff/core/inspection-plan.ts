/**
 * The farmer-facing inspection plan: the exposure model's grid reduced to a few plain-language
 * areas to walk, each with a watch/inspect level, a reason in words, a size, and suggested points
 * with a status from the field records. The scientific layer stays in the agronomist map.
 */
import { EXPOSURE_TOPICS } from '../models/cwsb-model';
import type { GuardedView } from './guarded-exposure';
import { ESTIMATED_BOUNDARY_ID } from './record-zones';

export type AreaLevel = 'watch' | 'inspect' | 'confirmed';
export type PointStatus = 'pending' | 'inspected' | 'suspected';

export interface GridCellLike {
  i: number;
  row: number;
  col: number;
  lon: number;
  lat: number;
  zoneId?: string | null;
  display?: number | null;
  parts?: Record<string, number | null>;
}

export interface GridLike {
  width: number;
  height: number;
  resolution?: number;
  cells: GridCellLike[];
}

export interface PlanPoint {
  id: string;
  label: string;
  lon: number;
  lat: number;
  zoneId: string | null;
  status: PointStatus;
  statusText: string;
  recordDate?: string;
}

export interface PlanArea {
  n: number;
  name: string;
  level: AreaLevel;
  levelText: string;
  acres: number;
  acresText: string;
  reason: string;
  why: string[];
  zoneId: string | null;
  zoneName: string;
  centre: { lon: number; lat: number };
  cellIds: number[];
  cells: GridCellLike[];
  points: PlanPoint[];
  inspectedCount: number;
}

export interface PlanRecord {
  topic?: string;
  kind?: string;
  date?: string;
  affected?: number | null;
  inspected?: number | null;
  point?: { lon: number; lat: number } | null;
  zoneId?: string | null;
}

export interface LifecycleMessage {
  key: 'active' | 'preflight' | 'quiet';
  title: string;
  text: string;
}

const LEVEL_TEXT: Record<AreaLevel, string> = { watch: 'Low', inspect: 'Medium', confirmed: 'High' };
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

const FACTOR_WORDS: Record<string, string> = {
  heat: 'warmer ground',
  cool: 'cooler ground',
  shade: 'less shade',
  canopy: 'dense leaf cover',
  solar: 'more direct sunlight',
  sun: 'more direct sunlight',
  lowSun: 'less sunlight through the day',
  wet: 'wetter ground',
  low: 'low-lying ground',
};

const ACRE_M2 = 4046.86;

/** Eight-connected clusters of the cells that pass the threshold, largest score first. */
function clusters(cells: GridCellLike[]): GridCellLike[][] {
  const byKey = new Map<string, GridCellLike>();
  for (const c of cells) byKey.set(c.row + ':' + c.col, c);
  const seen = new Set<string>();
  const out: GridCellLike[][] = [];
  for (const c of cells) {
    const start = c.row + ':' + c.col;
    if (seen.has(start)) continue;
    const group: GridCellLike[] = [];
    const stack = [c];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const key = cur.row + dr + ':' + (cur.col + dc);
          const next = byKey.get(key);
          if (next && !seen.has(key)) {
            seen.add(key);
            stack.push(next);
          }
        }
    }
    out.push(group);
  }
  return out;
}

function compassFrom(centre: { lon: number; lat: number }, point: { lon: number; lat: number }): string {
  const dx = (point.lon - centre.lon) * Math.cos((centre.lat * Math.PI) / 180);
  const dy = point.lat - centre.lat;
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

function metres(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const cos = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot((a.lon - b.lon) * 111320 * cos, (a.lat - b.lat) * 111320);
}

/** Records for this topic near a point, newest first. */
function recordsNear(records: PlanRecord[], topic: string, point: { lon: number; lat: number }, withinM = 30): PlanRecord[] {
  return records
    .filter((r) => r.topic === topic && r.point && Number.isFinite(r.point.lon) && Number.isFinite(r.point.lat) && metres(r.point, point) <= withinM)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

function pointStatus(records: PlanRecord[], topic: string, point: { lon: number; lat: number }, withinM: number): { status: PointStatus; text: string; date?: string } {
  const near = recordsNear(records, topic, point, withinM);
  const latest = near[0];
  if (!latest) return { status: 'pending', text: 'Not inspected' };
  if ((latest.affected ?? 0) > 0) return { status: 'suspected', text: 'Symptoms noted', date: latest.date };
  return { status: 'inspected', text: 'No symptoms', date: latest.date };
}

export interface BuildPlanInput {
  topic: string;
  alertTopic: string;
  grid: GridLike | null;
  candidates: { lon: number; lat: number; zoneId?: string | null; i?: number | string }[];
  zones: { id: string; name: string }[];
  farmCentre: { lon: number; lat: number };
  records: PlanRecord[];
  /** Restrict to these zones; empty means the whole estate. */
  zoneIds?: string[];
  maxAreas?: number;
  /**
   * The guarded view (core/guarded-exposure.ts). When given, areas are built from its shown cells
   * (moderate and high on the 250 m context scale, built-up / bare ground masked) and points from
   * its ranked stops, as the twin's block page marks them; its `display` replaces the engine's
   * farm-relative one.
   */
  guarded?: GuardedView | null;
}

/** Id of the outline made for a farm with no mapped zones (see normalizeGeometry). */

/** Turn the exposure grid into up to three inspection areas with suggested points. */
export function buildPlan(input: BuildPlanInput): PlanArea[] {
  const { grid, zones, farmCentre, records, alertTopic } = input;
  if (!grid?.cells?.length) return [];
  const zoneFilter = new Set(input.zoneIds ?? []);
  // A farm with no drawn zones is outlined as one estimated boundary (id 'estimated-boundary'): the
  // farmer has no zones, so areas are named for the farm, not for "Zone 1" or "Farm".
  const mappedZones = zones.filter((z) => z.id !== ESTIMATED_BOUNDARY_ID);
  const zoneName = (id: string | null | undefined) =>
    mappedZones.find((z) => z.id === id)?.name ?? (mappedZones.length ? 'Estate' : 'Whole farm');
  const placeName = (id: string | null | undefined) =>
    mappedZones.length ? `part of ${zoneName(id)}` : 'part of the farm';
  const guarded = input.guarded ?? null;
  const inZones = (c: GridCellLike) => !!c.zoneId && (!zoneFilter.size || zoneFilter.has(c.zoneId));
  let hot: GridCellLike[], watchCut: number, inspectCut: number;
  if (guarded) {
    // Moderate and high cells on the 250 m context scale, bare ground masked; a farm below the
    // contrast gate shows nothing (guarded.shown is empty), so it gets no areas.
    hot = guarded.shown.filter(inZones);
    watchCut = 1 / 3;
    inspectCut = 2 / 3;
  } else {
    const inside = grid.cells.filter((c) => inZones(c) && Number.isFinite(c.display));
    if (!inside.length) return [];
    // The top third of the estate by relative exposure is worth a look; the top tenth is worth a walk.
    const sorted = [...inside].map((c) => c.display as number).sort((a, b) => a - b);
    // Relative within the estate, but never below an absolute floor: a uniformly calm estate has no areas.
    watchCut = Math.max(0.5, sorted[Math.floor(sorted.length * 0.68)] ?? 0.7);
    inspectCut = Math.max(0.75, sorted[Math.floor(sorted.length * 0.9)] ?? 0.85);
    hot = inside.filter((c) => (c.display as number) >= watchCut);
  }
  if (!hot.length) return [];
  const groups = clusters(hot)
    .filter((g) => g.length >= 2)
    .map((g) => {
      const mean = g.reduce((s, c) => s + (c.display as number), 0) / g.length;
      const peak = Math.max(...g.map((c) => c.display as number));
      return { cells: g, mean, peak, score: peak * 0.6 + mean * 0.3 + Math.min(1, g.length / 12) * 0.1 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, input.maxAreas ?? 3);
  const res = grid.resolution || 20;
  const cellAcres = (res * res) / ACRE_M2;
  return groups.map((g, index) => {
    const centre = {
      lon: g.cells.reduce((s, c) => s + c.lon, 0) / g.cells.length,
      lat: g.cells.reduce((s, c) => s + c.lat, 0) / g.cells.length,
    };
    const zoneCounts = new Map<string, number>();
    for (const c of g.cells) zoneCounts.set(c.zoneId as string, (zoneCounts.get(c.zoneId as string) ?? 0) + 1);
    const zoneId = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    // Which factors run highest across the area, in plain words.
    const factorMeans = new Map<string, number>();
    for (const c of g.cells)
      for (const [k, v] of Object.entries(c.parts ?? {}))
        if (Number.isFinite(v)) factorMeans.set(k, (factorMeans.get(k) ?? 0) + (v as number) / g.cells.length);
    const why = [...factorMeans.entries()]
      .filter(([, v]) => v >= 0.55)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => FACTOR_WORDS[k] ?? k)
      .slice(0, 3);
    const direction = compassFrom(farmCentre, centre);
    const name = `${direction[0].toUpperCase() + direction.slice(1)} ${placeName(zoneId)}`;
    const cellIds = new Set(g.cells.map((c) => c.i));
    // Suggested points: the ranked stops (guarded) or scouting candidates that fall in this area,
    // else the area's strongest cells.
    const stops = guarded ? guarded.stops : input.candidates;
    const own = stops.filter((p) => cellIds.has((p as GridCellLike).i as number) || g.cells.some((c) => Math.abs(c.lon - p.lon) < 1e-9 && Math.abs(c.lat - p.lat) < 1e-9 || metres(c, p) <= res * 0.75));
    const rank = (c: GridCellLike) => (guarded ? ((c as GridCellLike & { score?: number }).score ?? -1) : (c.display as number));
    const fallback = [...g.cells].sort((a, b) => rank(b) - rank(a)).slice(0, 5);
    const rawPoints = (own.length ? own : fallback).slice(0, 5);
    const points: PlanPoint[] = rawPoints.map((p, k) => {
      const st = pointStatus(records, alertTopic, p, Math.min(15, res * 0.6));
      return { id: `${index + 1}-${k + 1}`, label: `P${k + 1}`, lon: p.lon, lat: p.lat, zoneId: (p.zoneId as string) ?? zoneId, status: st.status, statusText: st.text, recordDate: st.date };
    });
    const confirmed = points.some((p) => p.status === 'suspected');
    const level: AreaLevel = confirmed ? 'confirmed' : g.peak >= inspectCut ? 'inspect' : 'watch';
    const acres = g.cells.length * cellAcres;
    const reason =
      why.length
        ? `This part has ${why.join(', ')} than the rest of the estate.`
        : 'Conditions here coincide more than elsewhere on the estate.';
    return {
      n: index + 1,
      name,
      level,
      levelText: LEVEL_TEXT[level],
      acres,
      acresText: acres < 0.1 ? 'under 0.1 acre' : `approx. ${acres.toFixed(1)} acre${acres >= 1.05 ? 's' : ''}`,
      reason,
      why,
      zoneId,
      zoneName: zoneName(zoneId),
      centre,
      cellIds: [...cellIds],
      cells: g.cells,
      points,
      inspectedCount: points.filter((p) => p.status !== 'pending').length,
    };
  });
}

/** What the season means for this topic right now, in the farmer's words. */
export function lifecycleMessage(topic: string, month: number): LifecycleMessage {
  const quiet = (when: string): LifecycleMessage => ({
    key: 'quiet',
    title: 'No action needed now',
    text: `These spots had problems before. They will be marked again when the next ${when} comes.`,
  });
  if (topic === 'drainage') return { key: 'quiet', title: 'No action needed now', text: 'These areas are more likely to collect water.' };
  const def = (EXPOSURE_TOPICS as Record<string, { title: string; phase: (m: number) => { key: string; label: string; message: string } }>)[topic];
  if (!def) return quiet('active season');
  const phase = def.phase(month);
  const off = def.phase(0);
  if (topic === 'cwsb') {
    if (phase.key === 'pre-summer' || phase.key === 'pre-winter')
      return { key: 'preflight', title: 'Before the beetle flight', text: 'Check the marked areas before the next beetle flight.' };
    if (phase.key === 'summer-flight' || phase.key === 'winter-flight')
      return { key: 'active', title: 'Beetles are flying', text: 'Check the marked areas now.' };
    return quiet('check time');
  }
  if (phase.key !== off.key) return { key: 'active', title: phase.label.charAt(0) + phase.label.slice(1).toLowerCase(), text: phase.message };
  return quiet('active season');
}

/** Farmer-facing checklist per topic; other topics use the scouting guide's own checks. */
export const FARMER_CHECKS: Record<string, string[]> = {
  wsb: ['Bark ridge or splitting on the main stem?', 'Frass or powder at the base?', 'Adult beetle seen?', 'Stem damage or holes?', 'Plant drying or wilting?'],
  rust: ['Yellow-orange powder under the leaves?', 'Yellow spots on the upper leaf?', 'Early leaf fall on the bush?'],
  blackrot: ['Blackened leaves and twigs sticking together?', 'Rotting berries on the branch?', 'Persistent mist or drip in the canopy?'],
  berryborer: ['Small round hole at the berry tip?', 'Berries dropping early?', 'Powdery frass at the berry?'],
  shothole: ['Pin holes on tender twigs?', 'Twigs drying from the tip?', 'Fine powder near the holes?'],
  mealybug: ['White cottony clusters on twigs or roots?', 'Ants attending the clusters?', 'Sooty mould on the leaves?'],
  root: ['Wilting plants in low ground?', 'Water standing after rain?', 'Roots dark or soft when checked?'],
  heat: ['Leaves drooping in the afternoon?', 'Scorch on exposed leaves?', 'Young plants drying?'],
  canopy: ['Bushes crowding each other?', 'Canopy slow to dry after rain?', 'Shade too dense for airflow?'],
};
