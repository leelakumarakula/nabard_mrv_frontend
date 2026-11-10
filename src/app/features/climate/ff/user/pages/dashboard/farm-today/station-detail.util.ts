import { DatePipe } from '@angular/common';

import { InHouseWeather } from '../../../../models/inhouseweather.interface';

/** A weather station's reading, as the dashboard receives it. */
export type StationInput = InHouseWeather & { isAnalogWeather?: boolean };

export interface StationRow {
  key: string;
  label: string;
  value: string;
  unit: string;
  icon: string;
}

export interface StationDetail {
  macId: string;
  name: string;
  /** When the station last reported, as the weather card always showed it. */
  updatedAt: string;
  /** One or more readings are negative, so cannot be real; those are left out and the rest still show. */
  invalid: boolean;
  /** The readings left out, in words for a sentence: "Air temperature and humidity". Empty when none. */
  faultyText: string;
  /** Leaf wetness alone is negative; the other readings can still be trusted. */
  leafWetnessInvalid: boolean;
  rows: StationRow[];
}

const datePipe = new DatePipe('en-US');

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : (value as number);
  return Number.isFinite(parsed) ? parsed : null;
}

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

/** The same dry / moderate / wet bands the weather card used for leaf wetness. */
export function leafWetnessWord(value: number): string {
  if (value < 2) return 'Dry';
  if (value < 3.9) return 'A little wet';
  return 'Wet';
}

/** The 0-31 signal reading as a word: Weak under 10, OK under 20, otherwise Strong. */
function networkWord(value: number | null): string | null {
  if (value === null) return null;
  if (value < 10) return 'Weak';
  return value < 20 ? 'OK' : 'Strong';
}

/** "Air temperature, humidity and wind speed": the first name as written, the rest in lower case. */
function listOf(names: string[]): string {
  const words = names.map((name, i) => (i === 0 ? name : name.charAt(0).toLowerCase() + name.slice(1)));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : (words[0] ?? '');
}

/** Every reading the station sends, in the units and wording the weather card used. */
export function buildStationDetail(station: StationInput): StationDetail {
  const analog = station.isAnalogWeather === true;
  const rows: StationRow[] = [];
  // A negative reading cannot be real, whatever the station says: it is left out, and named, so the
  // readings that are fine still show.
  const faulty: string[] = [];
  const sound = (value: unknown, label: string): unknown => {
    const parsed = num(value);
    if (parsed !== null && parsed < 0) {
      faulty.push(label);
      return null;
    }
    return value;
  };
  const add = (key: string, label: string, value: string | null, unit: string, icon: string) => {
    if (value !== null) rows.push({ key, label, value, unit, icon });
  };
  const measure = (value: unknown, digits: number): string | null => {
    const parsed = num(value);
    return parsed === null ? null : fixed(parsed, digits);
  };

  const leaf = num(station.leafWetness);
  const leafWetnessInvalid = leaf !== null && leaf < 0;
  const battery = num(analog ? station.batteryPercentage : sound(station.voltage, 'Battery'));

  add('temperature', 'Air temperature', measure(sound(station.airTemperature, 'Air temperature'), 1), '°C', 'thermometer');
  add('humidity', 'Humidity', measure(sound(station.airHumidity, 'Humidity'), 0), '%', 'drop');
  add('wind', 'Wind speed', measure(sound(station.windSpeed, 'Wind speed'), 2), analog ? 'm/s' : 'km/h', 'arrow');
  if (station.windDirection) add('direction', 'Wind direction', station.windDirection, '', 'arrow');
  add('rain', analog ? 'Rain total' : 'Rainfall', measure(sound(station.rainfall, analog ? 'Rain total' : 'Rainfall'), 1), 'mm', 'rain');
  if (!analog) add('pressure', 'Air pressure', measure(sound(station.airPressure, 'Air pressure'), 2), 'hPa', 'info');
  if (leaf !== null && !leafWetnessInvalid) {
    add('leaf', 'Leaf wetness', analog ? String(leaf) : leafWetnessWord(leaf), '', 'leaf');
  }
  add('battery', 'Battery', battery === null ? null : fixed(battery, 0), '%', 'battery');
  if (analog) {
    add('signal', 'Network', networkWord(num(station.signalStrength)), '', 'info');
    add('soilTemp', 'Soil temperature', measure(station.soilTemperature, 1), '°C', 'thermometer');
    add('moisture1', 'Soil water, top', measure(station.moisture1, 0), '', 'drop');
    add('moisture2', 'Soil water, deeper', measure(station.moisture2, 0), '', 'drop');
  }
  add('lux', 'Sunlight', measure(sound(station.lux, 'Sunlight'), 0), 'lx', 'sun');

  const when = station.updateAt ? datePipe.transform(station.updateAt, 'dd/MM/yyyy hh:mm:ss a') : null;
  return {
    macId: station.macId ?? '',
    name: station.deviceName || 'Weather station',
    updatedAt: when ? `${when} IST` : 'No readings yet',
    invalid: faulty.length > 0,
    faultyText: listOf(faulty),
    leafWetnessInvalid,
    rows,
  };
}
