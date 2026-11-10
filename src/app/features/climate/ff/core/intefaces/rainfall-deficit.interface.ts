// Data contracts for the Rainfall Deficit Analysis screen.
//
// The screen is an analysis extension of the Farm Profile: the 30-year rainfall
// baseline and the verified monthly/seasonal normals come from the same
// `GET /api/FarmProfile/{farmId}` + `/climate` payloads the Farm Profile view
// already renders, and the actual rainfall comes from the farm's own weather
// station via `GetWeatherStats`. Nothing here is specific to a single estate.

import { FarmProfileSummarySoil } from './farm-profile.interface';
import { DeviceCoordinate } from './device-coordinates.interface';

/** One season normal as published by the Farm Profile climate layer. */
export interface RainfallSeasonNormal {
  season: string;
  months: string;
  meanMm: number | null;
  pctOfAnnual: number | null;
}

/** The 30-year rainfall baseline for a farm — the single source of truth. */
export interface RainfallHistorical {
  unit: 'mm';
  /** The Farm Profile "Yearly rainfall" figure (summary.climate.annual_rainfall_mm). */
  annualAverage: number | null;
  /** The same figure as reported by the full climate layer, for cross-checking. */
  climateAnnualMean: number | null;
  cvPct: number | null;
  minAnnual: number | null;
  maxAnnual: number | null;
  swMonsoonPct: number | null;
  /** Verified monthly normals keyed 1..12. Never derived by dividing the annual figure. */
  monthly: Record<number, number>;
  /** Wettest / driest such month on record, used to flag implausible readings. */
  monthlyMax: Record<number, number>;
  monthlyMin: Record<number, number>;
  seasonal: RainfallSeasonNormal[];
  period: string | null;
  years: number | null;
  source: string | null;
}

/** A crop registered against the farm, with any recorded previous-year yield. */
export interface FarmCrop {
  cropType: string;
  previousYearYield: number | null;
}

/** Everything the analysis needs about the farm, all of it fetched per farm. */
export interface RainfallFarmContext {
  farmId: string;
  farmName: string;
  estateId: string | null;
  landSize: number | null;
  units: string | null;
  soilType: string | null;
  zipCode: string | null;
  cropGrowingStartDate: string | null;
  deviceStatus: boolean;
  location: {
    state: string | null;
    district: string | null;
    lat: number | null;
    lon: number | null;
  };
  historicalRainfall: RainfallHistorical;
  soil: FarmProfileSummarySoil | null;
  weatherDevice: DeviceCoordinate | null;
  /** Every weather station on the farm; rain is read from all of them. */
  weatherDevices?: DeviceCoordinate[];
  crops: FarmCrop[];
}

/** Status band derived from the percentage of expected rainfall received. */
export interface RainfallStatus {
  key: 'above' | 'normal' | 'mod' | 'sig' | 'severe' | 'upcoming' | 'nodata';
  label: string;
}

/** A like-for-like comparison of actual against normal for one date range. */
export interface PeriodAnalysis {
  start: Date;
  end: Date;
  days: number;
  measuredDays: number;
  coveragePct: number | null;
  expected: number | null;
  actual: number | null;
  /** Positive = surplus, negative = deficit. */
  diff: number | null;
  deficit: number | null;
  surplus: number | null;
  receivedPct: number | null;
  deficitPct: number | null;
  status: RainfallStatus;
}

export interface MonthlyRainfallRow {
  month: number;
  name: string;
  future: boolean;
  partialMonth: boolean;
  /** Normal for the whole calendar month. */
  fullNormal: number | null;
  /** Normal for exactly the days compared (pro-rated for a month in progress). */
  expected: number | null;
  actual: number | null;
  diff: number | null;
  receivedPct: number | null;
  coveragePct: number | null;
  measuredDays: number;
  elapsed: number;
  periodEnd: Date;
  /** Wettest such month in the 30-year record. */
  recordMax: number | null;
  /** Actual beats that record — treated as suspect station data, not a surplus. */
  exceedsRecord: boolean;
  status: RainfallStatus;
}

export interface SeasonRainfallRow {
  name: string;
  months: number[];
  future: boolean;
  partial: boolean;
  expected: number | null;
  actual: number | null;
  diff: number | null;
  receivedPct: number | null;
  measured: number;
  elapsed: number;
  status: RainfallStatus;
}

/** One water-sensitive growth stage in the yield-risk model. */
export interface YieldStageRow {
  name: string;
  months: number[];
  weight: number;
  effWeight: number;
  expected: number | null;
  actual: number | null;
  receivedPct: number | null;
  deficitPct: number;
  elapsedShare: number;
  hasSuspect: boolean;
  assessableMonths: number;
}

export interface YieldRiskResult {
  /** Set when the model cannot run; every other field is then absent. */
  unavailable?: string;
  cropKey?: string;
  cropLabel?: string;
  ky?: { low: number; expected: number; high: number };
  stageSummary?: string;
  rows: YieldStageRow[];
  rawDeficit?: number;
  shortfallMm?: number;
  bufferMm?: number;
  whc?: number | null;
  relief?: number;
  adjDeficit?: number;
  lossPct?: { low: number; expected: number; high: number };
  band?: RainfallStatus;
  exposure?: {
    baseKg: number;
    kg: { low: number; expected: number; high: number };
    value: { low: number; expected: number; high: number } | null;
  } | null;
}

/** A generated, data-backed insight card. */
export interface RainfallInsight {
  tone: 'good' | 'warn' | 'bad';
  title: string;
  body: string;
}

/** One validation check shown in the data-validation panel. */
export interface RainfallCheck {
  ok: boolean;
  text: string;
}

/** Geometry for the monthly grouped-bar chart, computed in the component. */
export interface MonthlyChartBar {
  month: number;
  label: string;
  future: boolean;
  suspect: boolean;
  /** Pale segment: the part of the month's normal not yet elapsed. */
  pendingX: number;
  pendingY: number;
  pendingH: number;
  /** Solid segment: the normal for the days actually compared. */
  normalX: number;
  normalY: number;
  normalH: number;
  hasActual: boolean;
  actualX: number;
  actualY: number;
  actualH: number;
  /** Translucent shortfall band sitting above the actual bar. */
  showGap: boolean;
  gapY: number;
  gapH: number;
  barW: number;
  labelX: number;
  tooltip: string;
}

export interface ChartGridLine {
  y: number;
  value: number;
  strong: boolean;
}

export interface CumulativeChartModel {
  expectedPath: string;
  actualPath: string;
  gapPath: string;
  grid: ChartGridLine[];
  monthTicks: { x: number; label: string }[];
  hasGap: boolean;
  gapLineX: number;
  gapLineY1: number;
  gapLineY2: number;
  gapLabelX: number;
  gapLabelY: number;
  gapLabel: string;
  markerX: number;
  markerY: number;
}
