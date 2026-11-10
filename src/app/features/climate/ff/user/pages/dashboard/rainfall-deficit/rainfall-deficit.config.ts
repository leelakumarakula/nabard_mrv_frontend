// Tunables for the Rainfall Deficit Analysis. Nothing here is farm-specific:
// every farm id, estate name, weather-station MAC and rainfall figure is read
// from the API at runtime for whichever farm the route points at.

/** A configurable season grouping. */
export interface SeasonDefinition {
  name: string;
  months: number[];
}

export interface SeasonPreset {
  key: string;
  label: string;
  seasons: SeasonDefinition[];
}

/** Status thresholds on "% of expected rainfall received". */
export const RAINFALL_STATUS_THRESHOLDS: {
  min: number;
  key: 'above' | 'normal' | 'mod' | 'sig' | 'severe';
  label: string;
}[] = [
  { min: 110, key: 'above', label: 'Above Average' },
  { min: 90, key: 'normal', label: 'Normal' },
  { min: 75, key: 'mod', label: 'Moderate Deficit' },
  { min: 50, key: 'sig', label: 'Significant Deficit' },
  { min: Number.NEGATIVE_INFINITY, key: 'severe', label: 'Severe Deficit' },
];

/** Season groupings the user can switch between. */
export const SEASON_PRESETS: SeasonPreset[] = [
  {
    key: 'standard',
    label: 'Standard grouping',
    seasons: [
      { name: 'Winter', months: [1, 2] },
      { name: 'Pre-Monsoon', months: [3, 4, 5] },
      { name: 'Southwest Monsoon', months: [6, 7, 8, 9] },
      { name: 'Post-Monsoon', months: [10, 11, 12] },
    ],
  },
  {
    key: 'profile',
    label: 'Farm Profile grouping',
    seasons: [
      { name: 'Dry', months: [12, 1, 2] },
      { name: 'Pre-Monsoon', months: [3, 4, 5] },
      { name: 'Southwest Monsoon', months: [6, 7, 8, 9] },
      { name: 'Post-Monsoon', months: [10, 11] },
    ],
  },
];

/** Coverage below this share of elapsed days is flagged as partial data. */
export const COVERAGE_WARN_PCT = 90;

/* ---------------------------------------------------------------------------
   Indicative yield-loss risk.

   A WATER-DEFICIT model, not a yield forecast. It converts the measured
   rainfall shortfall into an indicative relative yield loss using the FAO-33
   water production function:

       1 - (Ya / Ym) = Ky x (1 - water supply ratio)

   Stage calendars and Ky values are ASSUMPTIONS and need agronomist sign-off
   per crop and region. The model deliberately excludes irrigation, shade,
   pruning, blossom timing, pest/disease pressure, and the distribution of rain
   within a stage.

   Crops are matched by the `cropType` string the API returns for the farm
   (StaticData/GetCropsData vocabulary). A farm growing a crop that has no entry
   here simply is not offered for selection.
   --------------------------------------------------------------------------- */
export interface YieldCropModel {
  label: string;
  stages: { name: string; months: number[]; weight: number }[];
  ky: { low: number; expected: number; high: number };
}

export const YIELD_CROP_MODELS: Record<string, YieldCropModel> = {
  'Coffee-Robusta': {
    label: 'Coffee — Robusta',
    stages: [
      { name: 'Flowering (blossom showers)', months: [3, 4], weight: 0.22 },
      { name: 'Bean set & expansion (SW monsoon)', months: [5, 6, 7, 8], weight: 0.4 },
      { name: 'Bean filling', months: [9, 10], weight: 0.23 },
      { name: 'Ripening', months: [11, 12], weight: 0.15 },
    ],
    ky: { low: 0.7, expected: 0.95, high: 1.2 },
  },
  'Coffee-Arabica': {
    label: 'Coffee — Arabica',
    stages: [
      { name: 'Flowering (blossom showers)', months: [2, 3], weight: 0.2 },
      { name: 'Fruit set (backing showers)', months: [4, 5], weight: 0.25 },
      { name: 'Bean expansion (SW monsoon)', months: [6, 7, 8], weight: 0.35 },
      { name: 'Bean filling & ripening', months: [9, 10], weight: 0.2 },
    ],
    ky: { low: 0.6, expected: 0.85, high: 1.1 },
  },
  'Tea-Assamica': {
    label: 'Tea — Assamica',
    stages: [
      { name: 'First flush', months: [3, 4], weight: 0.25 },
      { name: 'Second flush', months: [5, 6], weight: 0.3 },
      { name: 'Monsoon flush', months: [7, 8, 9], weight: 0.3 },
      { name: 'Autumn flush', months: [10, 11], weight: 0.15 },
    ],
    ky: { low: 0.8, expected: 1.0, high: 1.25 },
  },
  'Tea-Sinensis': {
    label: 'Tea — Sinensis',
    stages: [
      { name: 'First flush', months: [3, 4], weight: 0.25 },
      { name: 'Second flush', months: [5, 6], weight: 0.3 },
      { name: 'Monsoon flush', months: [7, 8, 9], weight: 0.3 },
      { name: 'Autumn flush', months: [10, 11], weight: 0.15 },
    ],
    ky: { low: 0.8, expected: 1.0, high: 1.25 },
  },
};

/** Soil moisture reserve assumptions, applied to the Farm Profile soil layer. */
export const YIELD_SOIL_BUFFER = {
  apply: true,
  rootDepthM: 0.8,
  readilyAvailableFraction: 0.5,
};

/** Risk bands on the central (expected-Ky) yield-loss estimate. */
export const YIELD_RISK_BANDS: {
  min: number;
  key: 'severe' | 'sig' | 'mod' | 'normal';
  label: string;
}[] = [
  { min: 30, key: 'severe', label: 'Severe risk' },
  { min: 20, key: 'sig', label: 'High risk' },
  { min: 10, key: 'mod', label: 'Moderate risk' },
  { min: Number.NEGATIVE_INFINITY, key: 'normal', label: 'Low risk' },
];

/**
 * Optional absolute-exposure inputs. Left null because no baseline yield is
 * recorded against farms today; when a farm reports a previous-year yield the
 * analysis uses that instead, and these stay as a manual override.
 */
export const YIELD_BASELINE_OVERRIDE: {
  yieldKgPerAcre: number | null;
  pricePerKg: number | null;
  currency: string;
} = {
  yieldKgPerAcre: null,
  pricePerKg: null,
  currency: '₹',
};

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
