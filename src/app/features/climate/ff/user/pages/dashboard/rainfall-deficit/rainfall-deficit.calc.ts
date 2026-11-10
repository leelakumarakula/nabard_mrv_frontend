// Pure calculation layer for the Rainfall Deficit Analysis.
//
// Deliberate properties, all of which hold for any farm:
//  - Expected rainfall for a range is summed from the VERIFIED 30-year monthly
//    normals, pro-rating a partial month across that month's own days. The
//    annual figure is never divided by 12.
//  - A partial period is never compared against a full-year average.
//  - Future months are excluded from totals, never counted as zero rainfall.
//  - Days with no station reading are "no data", not zero.
//  - A month wetter than the wettest such month in the 30-year record is
//    flagged as suspect station data rather than reported as a surplus.
//
// No DOM, no HTTP, no farm-specific constants — safe to unit-test and to run
// during SSR.

import {
  MonthlyRainfallRow,
  PeriodAnalysis,
  RainfallFarmContext,
  RainfallStatus,
  SeasonRainfallRow,
  YieldRiskResult,
  YieldStageRow,
} from '../../../../core/intefaces/rainfall-deficit.interface';
import {
  MONTH_NAMES,
  MONTH_SHORT,
  RAINFALL_STATUS_THRESHOLDS,
  SeasonDefinition,
  YIELD_BASELINE_OVERRIDE,
  YIELD_CROP_MODELS,
  YIELD_RISK_BANDS,
  YIELD_SOIL_BUFFER,
} from './rainfall-deficit.config';

export const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------------------------------------------------------
   Formatting. Shared by the screen and the PDF export so the two can never
   disagree, and so neither can ever render NaN, undefined or Infinity.
   --------------------------------------------------------------------------- */

export function fmtNum(v: number | null | undefined, dp = 1): string {
  if (!isNum(v)) return '—';
  return v.toLocaleString('en-IN', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function fmtMm(v: number | null | undefined, dp = 1): string {
  return isNum(v) ? `${fmtNum(v, dp)} mm` : '—';
}

/** Guards divide-by-zero and absurd ratios against a near-zero normal. */
export function fmtPct(v: number | null | undefined, dp = 1): string {
  if (!isNum(v)) return '—';
  if (v > 999) return '>999%';
  return `${v.toFixed(dp)}%`;
}

export function fmtAbs(v: number | null | undefined, dp = 1): string {
  return isNum(v) ? fmtNum(Math.abs(v), dp) : '—';
}

export function fmtDate(d: Date | null | undefined): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateLong(d: Date | null | undefined): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function signPrefix(v: number | null | undefined): string {
  if (!isNum(v) || v === 0) return '';
  return v < 0 ? '−' : '+';
}

/** "−123.4" / "+12.0" / "—" — the signed cell text used in every table. */
export function fmtSigned(v: number | null | undefined, dp = 1): string {
  if (!isNum(v)) return '—';
  return `${signPrefix(v)}${fmtAbs(v, dp)}`;
}

export const daysInMonth = (y: number, m: number): number =>
  new Date(y, m, 0).getDate();

export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

export function keyToDate(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const dayCount = (a: Date, b: Date): number =>
  Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;

/** Status from % received, handling the "normal is effectively zero" case. */
export function classify(
  receivedPct: number | null,
  expected: number | null,
  actual: number | null,
): RainfallStatus {
  if (!isNum(expected) || !isNum(actual)) return { key: 'nodata', label: 'No data' };
  if (expected <= 0) {
    return actual > 0
      ? { key: 'above', label: 'Above Average' }
      : { key: 'normal', label: 'Normal' };
  }
  if (!isNum(receivedPct)) return { key: 'nodata', label: 'No data' };
  for (const t of RAINFALL_STATUS_THRESHOLDS) {
    if (receivedPct >= t.min) return { key: t.key, label: t.label };
  }
  return { key: 'nodata', label: 'No data' };
}

/**
 * Expected (historical normal) rainfall for an arbitrary date range, built from
 * the verified monthly normals. Returns null when the 12 normals aren't all
 * present — the caller then reports that monthly analysis isn't possible rather
 * than inventing values.
 */
export function expectedForRange(
  monthly: Record<number, number>,
  start: Date,
  end: Date,
): number | null {
  if (Object.keys(monthly).length !== 12) return null;
  if (!(start instanceof Date) || !(end instanceof Date) || end < start) return null;
  let total = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const m = d.getMonth() + 1;
    total += monthly[m] / daysInMonth(d.getFullYear(), m);
  }
  return total;
}

/** Measured rainfall for a range, with data-coverage detail. */
export function actualForRange(
  daily: Map<string, number>,
  start: Date,
  end: Date,
): { total: number | null; measured: number; elapsed: number; coveragePct: number | null } {
  if (!(start instanceof Date) || !(end instanceof Date) || end < start) {
    return { total: null, measured: 0, elapsed: 0, coveragePct: null };
  }
  let total = 0;
  let measured = 0;
  let elapsed = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    elapsed++;
    const v = daily.get(dateKey(d));
    if (isNum(v)) {
      total += v;
      measured++;
    }
  }
  return {
    total: measured ? total : null,
    measured,
    elapsed,
    coveragePct: elapsed ? (measured / elapsed) * 100 : null,
  };
}

/** Full like-for-like comparison for a period. */
export function analysePeriod(
  monthly: Record<number, number>,
  daily: Map<string, number>,
  start: Date,
  end: Date,
): PeriodAnalysis {
  const expected = expectedForRange(monthly, start, end);
  const act = actualForRange(daily, start, end);
  const actual = act.total;
  const both = isNum(expected) && isNum(actual);
  const diff = both ? actual - expected : null;
  return {
    start,
    end,
    days: act.elapsed,
    measuredDays: act.measured,
    coveragePct: act.coveragePct,
    expected,
    actual,
    diff,
    deficit: both ? Math.max(0, expected - actual) : null,
    surplus: both ? Math.max(0, actual - expected) : null,
    receivedPct: both && expected > 0 ? (actual / expected) * 100 : null,
    deficitPct:
      both && expected > 0 ? (Math.max(0, expected - actual) / expected) * 100 : null,
    status: classify(
      both && expected > 0 ? (actual / expected) * 100 : null,
      expected,
      actual,
    ),
  };
}

/** Month-by-month rows for the table and the chart. */
export function buildMonthlyRows(
  ctx: RainfallFarmContext,
  daily: Map<string, number>,
  year: number,
  latest: Date | null,
): MonthlyRainfallRow[] {
  const normals = ctx.historicalRainfall.monthly;
  const rows: MonthlyRainfallRow[] = [];

  for (let m = 1; m <= 12; m++) {
    const mStart = new Date(year, m - 1, 1);
    const mEnd = new Date(year, m, 0);
    const fullNormal = isNum(normals[m]) ? normals[m] : null;
    const recordMax = isNum(ctx.historicalRainfall.monthlyMax[m])
      ? ctx.historicalRainfall.monthlyMax[m]
      : null;

    if (!latest || mStart > latest) {
      rows.push({
        month: m,
        name: MONTH_NAMES[m - 1],
        future: true,
        partialMonth: false,
        fullNormal,
        expected: fullNormal,
        actual: null,
        diff: null,
        receivedPct: null,
        coveragePct: null,
        measuredDays: 0,
        elapsed: 0,
        periodEnd: mEnd,
        recordMax,
        exceedsRecord: false,
        status: { key: 'upcoming', label: 'Upcoming' },
      });
      continue;
    }

    const periodEnd = mEnd < latest ? mEnd : latest;
    const a = analysePeriod(normals, daily, mStart, periodEnd);

    // Data validation: beating the wettest such month in the entire record is
    // treated as a sensor/commissioning artefact, not a genuine surplus.
    const exceedsRecord =
      isNum(a.actual) && isNum(recordMax) && recordMax > 0 && a.actual > recordMax;

    rows.push({
      month: m,
      name: MONTH_NAMES[m - 1],
      future: false,
      partialMonth: periodEnd < mEnd,
      fullNormal,
      expected: a.expected,
      actual: a.actual,
      diff: a.diff,
      receivedPct: a.receivedPct,
      coveragePct: a.coveragePct,
      measuredDays: a.measuredDays,
      elapsed: a.days,
      periodEnd,
      recordMax,
      exceedsRecord,
      status: a.measuredDays === 0 ? { key: 'nodata', label: 'No data' } : a.status,
    });
  }
  return rows;
}

/** Seasonal aggregation over the elapsed part of each season's months. */
export function buildSeasonalRows(
  ctx: RainfallFarmContext,
  daily: Map<string, number>,
  year: number,
  latest: Date | null,
  seasons: SeasonDefinition[],
): SeasonRainfallRow[] {
  const normals = ctx.historicalRainfall.monthly;

  return seasons.map((season) => {
    let expected = 0;
    let actual = 0;
    let measured = 0;
    let elapsed = 0;
    let anyElapsed = false;
    let hasExpected = true;
    let anyPartial = false;

    season.months.forEach((m) => {
      const mStart = new Date(year, m - 1, 1);
      const mEnd = new Date(year, m, 0);
      if (!latest || mStart > latest) {
        anyPartial = true;
        return;
      }
      const periodEnd = mEnd < latest ? mEnd : latest;
      if (periodEnd < mEnd) anyPartial = true;
      anyElapsed = true;

      const e = expectedForRange(normals, mStart, periodEnd);
      if (!isNum(e)) {
        hasExpected = false;
        return;
      }
      const a = actualForRange(daily, mStart, periodEnd);
      expected += e;
      if (isNum(a.total)) actual += a.total;
      measured += a.measured;
      elapsed += a.elapsed;
    });

    if (!anyElapsed) {
      const fullNormal = season.months.reduce(
        (s, m) => s + (isNum(normals[m]) ? normals[m] : 0),
        0,
      );
      return {
        name: season.name,
        months: season.months,
        future: true,
        partial: true,
        expected: fullNormal || null,
        actual: null,
        diff: null,
        receivedPct: null,
        measured: 0,
        elapsed: 0,
        status: { key: 'upcoming', label: 'Upcoming' },
      };
    }

    const ok = hasExpected && measured > 0;
    const receivedPct = ok && expected > 0 ? (actual / expected) * 100 : null;
    return {
      name: season.name,
      months: season.months,
      future: false,
      partial: anyPartial,
      expected: hasExpected ? expected : null,
      actual: measured ? actual : null,
      diff: ok ? actual - expected : null,
      receivedPct,
      measured,
      elapsed,
      status: measured
        ? classify(receivedPct, expected, actual)
        : { key: 'nodata', label: 'No data' },
    };
  });
}

/**
 * If the suspect months form an unbroken run from January — the classic signal
 * of a station still being commissioned — re-run the comparison from the first
 * trustworthy month so the headline can be read both ways.
 */
export function adjustedAnalysis(
  ctx: RainfallFarmContext,
  daily: Map<string, number>,
  months: MonthlyRainfallRow[],
  year: number,
  latest: Date | null,
): { names: string[]; analysis: PeriodAnalysis | null } | null {
  const flagged = months.filter((r) => r.exceedsRecord).map((r) => r.month).sort((a, b) => a - b);
  if (!flagged.length || !latest) return null;

  const names = flagged.map((m) => MONTH_NAMES[m - 1]);
  const contiguousFromJan = flagged.every((m, i) => m === i + 1);
  if (!contiguousFromJan) return { names, analysis: null };

  const startMonth = flagged[flagged.length - 1] + 1;
  if (startMonth > 12) return { names, analysis: null };
  const start = new Date(year, startMonth - 1, 1);
  if (start > latest) return { names, analysis: null };

  return {
    names,
    analysis: analysePeriod(ctx.historicalRainfall.monthly, daily, start, latest),
  };
}

/**
 * Indicative yield-loss risk from the measured rainfall shortfall.
 *
 * Stage weights are scaled by how much of each stage has ELAPSED, so a stage a
 * day old contributes almost nothing. Suspect months are excluded and each
 * stage's weight reduced by the share of its normal that was not assessable.
 * Ky is carried as a range so the result is a band, never a single figure.
 */
export function yieldRiskAnalysis(
  ctx: RainfallFarmContext,
  months: MonthlyRainfallRow[],
  cropKey: string | null,
  climateReady: boolean,
  latest: Date | null,
): YieldRiskResult {
  const normals = ctx.historicalRainfall.monthly;
  if (!climateReady || !latest || Object.keys(normals).length !== 12) {
    return {
      rows: [],
      unavailable:
        'Usual rain by month is not available, so yield loss risk cannot be shown yet.',
    };
  }

  const crop = cropKey ? YIELD_CROP_MODELS[cropKey] : undefined;
  if (!crop) {
    return {
      rows: [],
      unavailable: ctx.crops.length
        ? `This farm's registered crops (${ctx.crops
            .map((c) => c.cropType)
            .join(', ')}) have no water-sensitivity calendar configured, so yield risk is not modelled.`
        : 'No crop is registered against this farm, so no growth-stage calendar can be applied.',
    };
  }

  const byMonth = new Map(months.map((r) => [r.month, r]));
  const rows: YieldStageRow[] = [];
  let totalWeight = 0;
  let weightedDeficit = 0;
  let shortfallMm = 0;

  crop.stages.forEach((st) => {
    const fullNormal = st.months.reduce(
      (s, m) => s + (isNum(normals[m]) ? normals[m] : 0),
      0,
    );
    let elapsedNormal = 0;
    let okNormal = 0;
    let okActual = 0;
    let assessableMonths = 0;
    let hasSuspect = false;

    st.months.forEach((m) => {
      const r = byMonth.get(m);
      if (!r || r.future) return;
      const e = isNum(r.expected) ? r.expected : 0;
      elapsedNormal += e;
      if (r.exceedsRecord) {
        hasSuspect = true;
        return;
      }
      if (!isNum(r.actual)) return;
      okNormal += e;
      okActual += r.actual;
      assessableMonths++;
    });

    const assessableShare = elapsedNormal > 0 ? okNormal / elapsedNormal : 0;
    const elapsedShare = fullNormal > 0 ? elapsedNormal / fullNormal : 0;
    const effWeight = st.weight * elapsedShare * assessableShare;
    const received = okNormal > 0 ? okActual / okNormal : null;
    const deficit = isNum(received) ? Math.max(0, 1 - received) : 0;

    if (okNormal > okActual) shortfallMm += okNormal - okActual;
    totalWeight += effWeight;
    weightedDeficit += effWeight * deficit;

    rows.push({
      name: st.name,
      months: st.months,
      weight: st.weight,
      effWeight,
      expected: assessableMonths ? okNormal : null,
      actual: assessableMonths ? okActual : null,
      receivedPct: isNum(received) ? received * 100 : null,
      deficitPct: deficit * 100,
      elapsedShare,
      hasSuspect,
      assessableMonths,
    });
  });

  if (totalWeight <= 0) {
    return {
      rows,
      unavailable: 'No growth stage has enough rainfall readings yet to show yield loss risk.',
    };
  }

  const rawDeficit = weightedDeficit / totalWeight;

  // Soil moisture reserve, from the Farm Profile soil layer.
  const whc = ctx.soil ? toNum(ctx.soil.whc_mm_per_m) : null;
  const bufferMm =
    YIELD_SOIL_BUFFER.apply && isNum(whc)
      ? whc * YIELD_SOIL_BUFFER.rootDepthM * YIELD_SOIL_BUFFER.readilyAvailableFraction
      : 0;
  const relief = bufferMm > 0 && shortfallMm > 0 ? Math.min(1, bufferMm / shortfallMm) : 0;
  const adjDeficit = Math.max(0, rawDeficit * (1 - relief));

  const lossPct = {
    low: Math.min(100, crop.ky.low * adjDeficit * 100),
    expected: Math.min(100, crop.ky.expected * adjDeficit * 100),
    high: Math.min(100, crop.ky.high * adjDeficit * 100),
  };
  const bandDef =
    YIELD_RISK_BANDS.find((b) => lossPct.expected >= b.min) ??
    YIELD_RISK_BANDS[YIELD_RISK_BANDS.length - 1];

  // Absolute exposure only when a real baseline exists: a previous-year yield
  // recorded for this crop, or an explicit override. Never invented.
  const recorded = ctx.crops.find(
    (c) => c.cropType === cropKey && isNum(c.previousYearYield) && c.previousYearYield > 0,
  );
  const perAcre = recorded && isNum(recorded.previousYearYield)
    ? recorded.previousYearYield / (isNum(ctx.landSize) && ctx.landSize > 0 ? ctx.landSize : 1)
    : YIELD_BASELINE_OVERRIDE.yieldKgPerAcre;

  let exposure: YieldRiskResult['exposure'] = null;
  if (isNum(perAcre) && isNum(ctx.landSize)) {
    const baseKg = perAcre * ctx.landSize;
    const kg = {
      low: (baseKg * lossPct.low) / 100,
      expected: (baseKg * lossPct.expected) / 100,
      high: (baseKg * lossPct.high) / 100,
    };
    const price = YIELD_BASELINE_OVERRIDE.pricePerKg;
    exposure = {
      baseKg,
      kg,
      value: isNum(price)
        ? { low: kg.low * price, expected: kg.expected * price, high: kg.high * price }
        : null,
    };
  }

  return {
    rows,
    cropKey: cropKey ?? undefined,
    cropLabel: crop.label,
    ky: crop.ky,
    stageSummary: crop.stages
      .map((s) => `${s.name.split(' (')[0]} ${Math.round(s.weight * 100)}%`)
      .join(', '),
    rawDeficit,
    shortfallMm,
    bufferMm,
    whc,
    relief,
    adjDeficit,
    lossPct,
    band: { key: bandDef.key, label: bandDef.label },
    exposure,
  };
}
