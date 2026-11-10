import { DeviceTimePipe } from '../../../../core/pipes/device-time.pipe';
import { DashboardSensorData } from '../../../../core/intefaces/sensor-data.interface';
import {
  buildCropProfile,
  CropProfile,
  LevelState,
  levelOf,
  nutrientLevels,
  Variety,
} from './coffee-profile.util';

export type FarmAdviceLevel = 'urgent' | 'attention' | 'info' | 'good';

export interface FarmAdvice {
  id: string;
  level: FarmAdviceLevel;
  /** Icon name for the card; the card falls back to one for its level. */
  icon?: string;
  title: string;
  detail: string;
  /** Router link (absolute) to the page that helps the farmer act on this. */
  link?: string[];
  linkLabel?: string;
}

/** The subset of a weather-station record the dashboard summary needs. */
export interface StationReading {
  airTemperature?: number | string | null;
  airHumidity?: number | string | null;
  rainfall?: number | string | null;
}

/** One day of satellite forecast, as produced by `selectDailyWeather`. */
export interface ForecastDay {
  date: string;
  temp_max: string | number;
  temp_min: string | number;
  /** Rain probability, e.g. "40%". */
  pop: string;
  humidity: number;
  description: string;
  icon: string;
}

/**
 * Which rules run. `weather` is the farm-wide advice (rain, heat, disease risk,
 * flowering and harvest weather); `soil` is what belongs to one set of devices
 * (irrigation, pH, nutrients, device health). `all` is both, for farms that are
 * not split into zones.
 */
export type AdviceScope = 'all' | 'weather' | 'soil';

export interface FarmTodayInput {
  sensors: DashboardSensorData[];
  station: StationReading | null;
  forecast: ForecastDay[];
  /** Month 1-12 in IST, used for the coffee calendar rules. */
  month: number;
  /** The crop being advised on. Defaults to coffee of unknown variety. */
  profile?: CropProfile;
  scope?: AdviceScope;
  /** The advisory already has an irrigation task, so weather cards defer to it instead of saying when to water. */
  irrigationTask?: boolean;
  /** Current time, injectable for tests. */
  now?: Date;
}

export type FarmStatus = LevelState;

export const RAIN_LIKELY_POP = 60;
export const FUNGAL_HUMIDITY = 85;
export const STALE_AFTER_HOURS = 24;
/** Mirrors getBatteryIconClass(): at or below this the device is nearly flat. */
export const LOW_BATTERY = 10;

/**
 * The coffee year by variety, from the CCRI handbook. Arabica and Robusta differ, so a farm with
 * one gets that one's months; a farm with both, or none recorded, gets the months of either.
 */
interface VarietyMonths {
  arabica: number[];
  robusta: number[];
}

/** Blossom showers (or blossom irrigation) set the crop: March-April for Arabica, February-March for Robusta. */
const BLOSSOM_MONTHS: VarietyMonths = { arabica: [3, 4], robusta: [2, 3] };
/** The backing shower (about 25 mm) must follow the blossom rain within a month (Arabica) or 20-25 days (Robusta). */
const BACKING_MONTHS: VarietyMonths = { arabica: [4, 5], robusta: [3, 4] };
/** Picking: November-January for Arabica, December-February for Robusta. */
const HARVEST_MONTHS: VarietyMonths = { arabica: [11, 12, 1], robusta: [12, 1, 2] };

function monthsFor(months: VarietyMonths, variety: Variety): number[] {
  if (variety === 'arabica') return months.arabica;
  if (variety === 'robusta') return months.robusta;
  return [...new Set([...months.arabica, ...months.robusta])];
}

/** How long after the blossom rain the backing shower is still in time. */
function backingLimit(variety: Variety): string {
  return variety === 'arabica' ? 'a month' : 'three weeks';
}

/**
 * The handbook's lime dose for a soil pH, in tonnes of agricultural lime per acre, or null when
 * the soil needs none (pH above about 6.0).
 */
export function limeDose(ph: number): string | null {
  if (ph > 6.0) return null;
  if (ph < 4.5) return 'about 2 tonnes per acre, in two halves';
  if (ph <= 5.0) return 'about 1.5 tonnes per acre, in two halves';
  if (ph <= 5.5) return 'about 1 tonne per acre';
  return 'about half a tonne per acre';
}
/** Months leaf rust and black rot can spread: the wet season and the weeks after it. */
const LEAF_DISEASE_MONTHS = [6, 7, 8, 9, 10, 11, 12, 1, 2];

const ROUTE = '/user/dashboard';
const LEVEL_ORDER: Record<FarmAdviceLevel, number> = {
  urgent: 0,
  attention: 1,
  info: 2,
  good: 3,
};

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Average of the finite, non-negative readings (sensors report negatives when faulty). */
export function average(values: unknown[]): number | null {
  const valid = values
    .map(toNumber)
    .filter((v): v is number => v !== null && v >= 0);
  if (!valid.length) {
    return null;
  }
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export function moistureStatus(pct: number | null, profile: CropProfile): FarmStatus {
  return levelOf(pct, profile.moisture);
}

export function phStatus(ph: number | null, profile: CropProfile): FarmStatus {
  // A pH of 0 is a probe with nothing to report.
  return ph === null || ph <= 0 ? 'unknown' : levelOf(ph, profile.ph);
}

function popOf(day: ForecastDay | undefined): number {
  return toNumber(day?.pop) ?? 0;
}

/** Hours since the device last reported, or null if the timestamp is missing/unparseable. */
export function hoursSinceUpdate(sensor: DashboardSensorData, now: Date): number | null {
  // utc_updatedat carries no zone marker, so it is read as UTC explicitly.
  const raw = sensor.utc_updatedat;
  if (!raw) {
    return null;
  }
  const time = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`);
  return Number.isNaN(time) ? null : (now.getTime() - time) / 3_600_000;
}

const deviceTime = new DeviceTimePipe();

/**
 * When a device last reported, in the device's own local time with the zone named, on the farm's own
 * clock: "Today, 6:25 AM", "Yesterday, 6:25 PM" or "8 Oct, 6:25 AM".
 */
export function formatUpdated(sensor: DashboardSensorData): string {
  return deviceTime.transform(sensor.utc_updatedat, sensor.lat, sensor.long, 'friendly') || 'No recent data';
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function buildFarmAdvice(input: FarmTodayInput): FarmAdvice[] {
  const { sensors, station, forecast, month } = input;
  const profile = input.profile ?? buildCropProfile();
  const coffee = profile.isCoffee;
  const scope = input.scope ?? 'all';
  const wantWeather = scope !== 'soil';
  const wantSoil = scope !== 'weather';
  const now = input.now ?? new Date();
  const irrigationTask = input.irrigationTask === true;
  const waterNote = irrigationTask ? ' Water as the tasks below say.' : ' Do not water until the rain comes.';
  const advice: FarmAdvice[] = [];
  const hasDevices = sensors.length > 0;

  const today = forecast[0];
  const tomorrow = forecast[1];
  const rainSoon = Math.max(popOf(today), popOf(tomorrow));
  const rainLikely = rainSoon >= RAIN_LIKELY_POP;
  const hotToday = (toNumber(today?.temp_max) ?? 0) >= profile.hotLimitC;
  const humidity = toNumber(station?.airHumidity) ?? toNumber(today?.humidity);
  const airTemp = toNumber(station?.airTemperature);

  const moisture = average(sensors.map((s) => s.soilProperties?.soilMoisturePercentage1));
  const ph = average(sensors.map((s) => s.soilProperties?.ph));
  const moistureState = moistureStatus(moisture, profile);
  const [phLow, phHigh] = profile.ph;

  if (wantSoil) {
    // Irrigation: soil dryness read against the rain outlook.
    if (moistureState === 'low') {
      advice.push(
        rainLikely
          ? {
              id: 'irrigation-wait',
              icon: 'drop',
              // Dry is still something to keep an eye on, even when rain is on the way.
              level: 'attention',
              title: 'Soil is dry, but rain is coming',
              detail: `${Math.round(rainSoon)}% chance of rain in the next two days. Wait for the rain before you water.`,
            }
          : {
              id: 'irrigation-needed',
              icon: 'drop',
              level: 'urgent',
              title: 'Water this zone soon',
              detail: `The soil is dry and no rain is coming. Water this zone soon.${hotToday ? ' Do it early in the morning.' : ''}${profile.moistureNote ? ` ${profile.moistureNote}` : ''}`,
              link: [ROUTE, 'irrigation'],
              linkLabel: 'Open watering plan',
            },
      );
    } else if (moistureState === 'high') {
      advice.push({
        id: 'waterlogging',
        icon: 'drop',
        level: 'attention',
        title: 'Soil is too wet',
        detail: coffee
          ? `Soil water is about ${Math.round(moisture!)}%. Do not water. Clear the drains: coffee roots rot when water stands around them.${profile.moistureNote ? ` ${profile.moistureNote}` : ''}`
          : `Soil water is about ${Math.round(moisture!)}%. Do not water. Check that water drains away from the roots.`,
      });
    }

    const phState = phStatus(ph, profile);
    if (phState === 'low') {
      advice.push({
        id: 'ph-acidic',
        icon: 'flask',
        level: 'attention',
        title: 'Soil is sour (acidic)',
        detail: `Average pH is ${ph!.toFixed(1)}; ${coffee ? 'coffee' : 'this crop'} likes ${phLow} to ${phHigh}. ${coffee && limeDose(ph!) ? `Lime: add ${limeDose(ph!)}, every two to three years, between November and May. Add fertiliser a month later.` : 'Add lime to raise it.'}`,
        link: [ROUTE, 'advisory'],
        linkLabel: 'See advisory',
      });
    } else if (phState === 'high') {
      advice.push({
        id: 'ph-alkaline',
        icon: 'flask',
        level: 'attention',
        title: 'Soil is alkaline',
        detail: `Average pH is ${ph!.toFixed(1)}; ${coffee ? 'coffee' : 'this crop'} likes ${phLow} to ${phHigh}.${coffee ? ' Above that, plants cannot get enough food from the soil.' : ''} Do not add lime, and follow the advisory for fertiliser.`,
        link: [ROUTE, 'advisory'],
        linkLabel: 'See advisory',
      });
    }

    // Fertiliser: only judged when the server says the soil is moist enough to trust the probe.
    const nutrients = nutrientLevels(sensors, profile, ph);
    const lowNutrients = (nutrients ?? []).filter((n) => n.state === 'low');
    if (lowNutrients.length) {
      const names = joinNames(lowNutrients.map((n) => n.label.replace(/ \(.\)$/, '').toLowerCase()));
      advice.push({
        id: 'nutrient-low',
        icon: 'sprout',
        level: 'attention',
        title: `Low ${names}`,
        detail: 'Plan your next fertiliser dose for this zone. The advisory shows how much to give.',
        link: [ROUTE, 'advisory'],
        linkLabel: 'See advisory',
      });
    }

    // Device health: a silent or flat device means the numbers above can't be trusted.
    for (const sensor of sensors) {
      const name = sensor.deviceName || sensor.macId;
      const hours = hoursSinceUpdate(sensor, now);
      if (hours !== null && hours > STALE_AFTER_HOURS) {
        advice.push({
          id: `stale-${sensor.macId}`,
          icon: 'sensor',
          level: 'attention',
          title: `${name} has not reported`,
          detail: `No reading for ${hours >= 48 ? `${Math.floor(hours / 24)} days` : `${Math.floor(hours)} hours`}. Check that the sensor has power and is switched on.`,
        });
        continue;
      }
      const battery = toNumber(sensor.soilProperties?.voltage);
      if (battery !== null && battery >= 0 && battery <= LOW_BATTERY) {
        advice.push({
          id: `battery-${sensor.macId}`,
          icon: 'battery',
          level: 'attention',
          title: `${name} battery is low`,
          detail: 'Recharge or replace the battery soon so readings do not stop.',
        });
      }
    }
  }

  if (wantWeather) {
    const isHarvest = coffee && monthsFor(HARVEST_MONTHS, profile.variety).includes(month);
    // Coffee flowers after a good shower; with none, the grower has to make one.
    if (coffee && monthsFor(BLOSSOM_MONTHS, profile.variety).includes(month)) {
      advice.push(
        rainLikely
          ? {
              id: 'blossom-rain',
              icon: 'rain',
              level: 'info',
              title: 'Rain at flowering time',
              detail: `${Math.round(rainSoon)}% chance of rain. A good shower can trigger flowering.${waterNote}`,
            }
          : {
              id: 'blossom-irrigation',
              icon: 'rain',
              level: 'attention',
              title: 'Flowering time: plan to water',
              detail:
                'No good shower is expected soon. Coffee flowers after a shower or watering. Water now to bring the flowering, then water again 2–3 weeks later.',
              link: [ROUTE, 'irrigation'],
              linkLabel: 'Open watering plan',
            },
      );
    } else if (coffee && monthsFor(BACKING_MONTHS, profile.variety).includes(month)) {
      // After flowering, fruit set needs a backing shower soon after the blossom rain.
      advice.push(
        rainLikely
          ? {
              id: 'backing-rain',
              icon: 'rain',
              level: 'info',
              title: 'Rain for the berries to set',
              detail: `${Math.round(rainSoon)}% chance of rain. A shower of about 25 mm soon after flowering helps the berries set.${waterNote}`,
            }
          : {
              id: 'backing-irrigation',
              icon: 'rain',
              level: 'attention',
              title: 'Plan to water after flowering',
              detail: `Berries need about 25 mm of rain or watering within ${backingLimit(profile.variety)} after flowering. Water the plants now. Berries need water after flowering.`,
              link: [ROUTE, 'irrigation'],
              linkLabel: 'Open watering plan',
            },
      );
    } else if (rainLikely && !(irrigationTask && !isHarvest)) {
      advice.push(
        isHarvest
          ? {
              id: 'harvest-rain',
              icon: 'rain',
              level: 'attention',
              title: 'Rain during harvest',
              detail: `${Math.round(rainSoon)}% chance of rain in the next two days. Pick ripe cherries before it, and cover the drying yards.`,
            }
          : {
              id: 'rain-plan',
              icon: 'rain',
              level: 'info',
              title: 'Rain expected',
              detail: `${Math.round(rainSoon)}% chance of rain in the next two days. Do not water. Plan spraying and fertiliser for a dry spell.`,
            },
      );
    }

    if (hotToday) {
      advice.push({
        id: 'heat',
        icon: 'sun',
        level: 'attention',
        title: 'Hot day ahead',
        detail: `Highs near ${Math.round(toNumber(today.temp_max)!)}°C${coffee ? `, above what ${profile.variety === 'robusta' ? 'Robusta' : 'Arabica'} coffee likes. Heat scorches leaves and flowers; keep the shade trees healthy` : ''}. Do field work early and keep young plants watered.`,
      });
    }

    // Disease pressure: warm, humid, wet weather favours leaf rust and black rot.
    const warmEnough = (airTemp ?? toNumber(today?.temp_max) ?? 0) >= 18;
    const diseaseSeason = !coffee || LEAF_DISEASE_MONTHS.includes(month);
    if (humidity !== null && humidity >= FUNGAL_HUMIDITY && warmEnough && diseaseSeason) {
      advice.push({
        id: 'fungal-risk',
        icon: 'leaf',
        level: 'attention',
        title: 'High risk of leaf disease',
        detail: coffee
          ? `Damp, warm air (${Math.round(humidity)}% humidity) lets leaf rust and black rot spread fast. Check leaves for orange powder (rust) and rotting leaves or berries (black rot).`
          : `Damp, warm air (${Math.round(humidity)}% humidity) lets leaf disease spread fast. Walk the plots and check leaves for spots or rust.`,
        link: [ROUTE, 'farm-health'],
        linkLabel: 'Scan a leaf',
      });
    }

    if (!hasDevices) {
      advice.push({
        id: 'add-device',
        icon: 'sprout',
        level: 'info',
        title: 'Get advice for your own soil',
        detail: 'Connect a soil device to see soil water, pH and nutrients, and get watering advice for your field.',
      });
    }
  }

  if (!advice.some((a) => a.level === 'urgent' || a.level === 'attention')) {
    advice.push({
      id: 'all-good',
      icon: 'check',
      level: 'good',
      title:
        scope === 'soil'
          ? 'Nothing needed here today'
          : scope === 'weather'
            ? 'No problems from weather today'
            : 'Nothing urgent today',
      detail:
        scope === 'soil'
          ? 'Soil readings look fine. Keep up your regular field checks.'
          : scope === 'weather'
            ? 'Rain, heat and humidity look fine. Keep up your regular field checks.'
            : hasDevices
              ? 'Soil and weather look fine. Keep up your regular field checks.'
              : 'Weather looks fine. Keep up your regular field checks.',
    });
  }

  // Array.sort is stable, so advice of equal level keeps the order rules ran in.
  return advice.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
