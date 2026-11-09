import { Row } from '../../core/models';

export type ColourMode = 'practice' | 'pest' | 'climate' | 'rainfall' | 'ndvi' | 'rain';

export interface LegendItem { key: string; label: string; colour: string }

export const NO_DATA: LegendItem = { key: 'none', label: 'No data', colour: '#9e9e9e' };
const RISK: LegendItem[] = [
  { key: 'low', label: 'Low', colour: '#43a047' }, { key: 'moderate', label: 'Moderate', colour: '#f9a825' },
  { key: 'high', label: 'High', colour: '#ef6c00' }, { key: 'very_high', label: 'Very high', colour: '#c62828' }, NO_DATA,
];

export const COLOUR_MODES: { value: ColourMode; label: string; legend: LegendItem[] }[] = [
  { value: 'practice', label: 'Practice progress (farmer)', legend: [
    { key: 'verified', label: 'Verified', colour: '#1b5e20' }, { key: 'observed', label: 'Observed', colour: '#43a047' },
    { key: 'reported', label: 'Reported', colour: '#f9a825' }, { key: 'recommended', label: 'Recommended', colour: '#fb8c00' },
    { key: 'none', label: 'No practice yet', colour: '#9e9e9e' }] },
  { value: 'pest', label: 'Current pest & disease risk', legend: RISK },
  { value: 'climate', label: 'Current climate risk', legend: RISK },
  { value: 'rainfall', label: 'Rain vs 30-year normal (year to date)', legend: [
    { key: 'extra', label: 'Extra rain (≥ 110 %)', colour: '#1565c0' }, { key: 'usual', label: 'Usual rain (90 – 110 %)', colour: '#43a047' },
    { key: 'little_less', label: 'Little less (75 – 90 %)', colour: '#f9a825' }, { key: 'much_less', label: 'Much less (50 – 75 %)', colour: '#ef6c00' },
    { key: 'very_much_less', label: 'Very much less (< 50 %)', colour: '#c62828' },
    { key: 'insufficient_data', label: 'Too few days measured', colour: '#cfd8dc' }, NO_DATA] },
  { value: 'ndvi', label: 'Satellite greenness (NDVI)', legend: [
    { key: 'dense', label: '≥ 0.6 dense green canopy', colour: '#1b5e20' }, { key: 'moderate', label: '0.4 – 0.6', colour: '#7cb342' },
    { key: 'sparse', label: '0.2 – 0.4', colour: '#d4e157' }, { key: 'bare', label: '< 0.2 little vegetation', colour: '#a1887f' }, NO_DATA] },
  { value: 'rain', label: 'Forecast rain, next days (total)', legend: [
    { key: 'r100', label: '≥ 100 mm', colour: '#0d47a1' }, { key: 'r50', label: '50 – 100 mm', colour: '#1e88e5' },
    { key: 'r10', label: '10 – 50 mm', colour: '#64b5f6' }, { key: 'r0', label: '< 10 mm', colour: '#bbdefb' }, NO_DATA] },
];

/** IoT device status (server field reporting_state): from the device status and its last stored reading. */
export const DEVICE_STATES: LegendItem[] = [
  { key: 'reporting', label: 'Reporting (last 2 days)', colour: '#2e7d32' },
  { key: 'late', label: 'Late (2 – 7 days)', colour: '#f9a825' },
  { key: 'silent', label: 'No data for 7+ days', colour: '#c62828' },
  { key: 'faulty', label: 'Marked faulty', colour: '#6a1b9a' },
  { key: 'planned', label: 'Planned', colour: '#90a4ae' },
];

export interface DeviceKind { letter: string; label: string }
const DEVICE_KINDS: Record<string, DeviceKind> = {
  soilsync_7in1: { letter: 'S', label: 'SoilSync soil sensor' },
  moisture_probe: { letter: 'P', label: 'Moisture probe' },
  microclime: { letter: 'W', label: 'MicroClime weather station' },
  rainsync: { letter: 'R', label: 'RainSync rain gauge' },
  analogue_weather: { letter: 'A', label: 'Analogue weather station' },
};
const OTHER_DEVICE: DeviceKind = { letter: 'D', label: 'Other device' };

export function deviceKind(type: string | null | undefined): DeviceKind {
  return (type && DEVICE_KINDS[type]) || OTHER_DEVICE;
}

export function deviceState(state: string | null | undefined): LegendItem {
  return DEVICE_STATES.find((s) => s.key === state) ?? { key: 'none', label: 'Unknown', colour: NO_DATA.colour };
}

/** Map icon name for a device: its type letter on its status colour (drawn on demand by the map). */
export function deviceIcon(device: Row): string {
  return `dev-${deviceKind(device['device_type']).letter}-${deviceState(device['reporting_state']).key}`;
}

export const LOCATION_NOTES: Record<string, string> = {
  far_from_plot: 'The position recorded in FarmFuture is far from this farm, so the device is not drawn – check it in FarmFuture.',
  no_position: 'No installed position recorded for this device.',
  plot_not_located: 'The plot has no GPS point, so the position cannot be checked.',
};

/** Legend key a plot falls into for the chosen colour mode. */
export function legendKey(plot: Row, mode: ColourMode): string {
  switch (mode) {
    case 'practice': return plot['practice_stage'] ?? 'none';
    case 'pest': return plot['pest_risk']?.['risk_level'] ?? 'none';
    case 'climate': return plot['climate_risk']?.['risk_level'] ?? 'none';
    case 'rainfall': return plot['rainfall']?.['ytd_status'] ?? 'none';
    case 'ndvi': {
      const v = plot['ndvi']?.['index_value'];
      if (v === undefined || v === null) return 'none';
      return v >= 0.6 ? 'dense' : v >= 0.4 ? 'moderate' : v >= 0.2 ? 'sparse' : 'bare';
    }
    case 'rain': {
      const v = plot['forecast']?.['rainfall_mm'];
      if (v === undefined || v === null) return 'none';
      return v >= 100 ? 'r100' : v >= 50 ? 'r50' : v >= 10 ? 'r10' : 'r0';
    }
  }
}

export function markerColour(plot: Row, mode: ColourMode): string {
  const legend = COLOUR_MODES.find((m) => m.value === mode)!.legend;
  return (legend.find((l) => l.key === legendKey(plot, mode)) ?? NO_DATA).colour;
}

/**
 * Position of a plot on the chosen legend scale, 0 (no data) to 1 (top class) – the height of its 3D column.
 * Every legend lists its classes from the highest (or most advanced) down, then "no data".
 */
export function legendLevel(plot: Row, mode: ColourMode): number {
  // "no data" and "too few days measured" are not a level on the scale: they stay flat
  const classes = COLOUR_MODES.find((m) => m.value === mode)!.legend.filter((l) => l.key !== 'none' && l.key !== 'insufficient_data');
  const index = classes.findIndex((l) => l.key === legendKey(plot, mode));
  if (index < 0) return 0;
  // Risk legends run low → very high and rainfall runs extra → very much less, so their order is reversed: the most
  // severe class (very high risk, very much less rain) is the tallest column.
  const rank = mode === 'pest' || mode === 'climate' || mode === 'rainfall' ? index + 1 : classes.length - index;
  return rank / classes.length;
}
