import {
  CROP_THRESHOLDS,
  CropThresholdKey,
  resolveCropThresholdKeyFromLabel,
  ThresholdRange,
} from '../../../../core/constants/crop-thresholds.config';
import { DashboardSensorData } from '../../../../core/intefaces/sensor-data.interface';
import { plantedSpecies } from '../../../../wsb/models/season-variety';

/** Where a reading sits against the crop's range. */
export type LevelState = 'low' | 'ok' | 'high' | 'unknown';

export type Variety = 'arabica' | 'robusta' | 'mixed' | null;

/**
 * What the dashboard needs to know about the crop it is advising on. The ranges
 * come from the app's own crop thresholds, so the dashboard and the device cards
 * agree on what "good" means.
 */
export interface CropProfile {
  cropKey: CropThresholdKey;
  isCoffee: boolean;
  variety: Variety;
  /** Short name for headings, e.g. "Arabica coffee". */
  label: string;
  moisture: ThresholdRange;
  /** Why the soil water range is what it is this month, or null when it is the usual range all year. */
  moistureNote: string | null;
  /** The month (1-12) the soil water range was set for, or null when it is not season-adjusted. */
  month: number | null;
  ph: ThresholdRange;
  temperature: ThresholdRange;
  nitrogen: ThresholdRange;
  phosphorus: ThresholdRange;
  potassium: ThresholdRange;
  /** Above this air temperature the crop is under heat stress. */
  hotLimitC: number;
}

/**
 * How the best soil water for coffee shifts with the stage the crop is in. The handbook gives the
 * timing (blossom and backing showers are needed on time; waterlogging makes fruit drop early) but
 * no soil-water percentages, so the ranges themselves are an agronomy judgement that moves the
 * edges of the usual 30-60%: they need an agronomist's sign-off before being relied on.
 */
const SEASONAL_MOISTURE: Partial<Record<StageKind, { range: ThresholdRange; why: string }>> = {
  rest: {
    range: [25, 55],
    why: 'The dry months before blossom are normal, so a lower reading is fine now.',
  },
  blossom: {
    range: [40, 60],
    why: 'While the plants flower and set berries, keep the soil moist: dry soil makes flowers and young berries fail.',
  },
  fruitset: {
    range: [40, 60],
    why: 'While the plants flower and set berries, keep the soil moist: dry soil makes flowers and young berries fail.',
  },
  maturing: {
    range: [25, 55],
    why: 'While berries ripen, keep the soil from getting too wet: waterlogging makes fruit drop early.',
  },
  harvest: {
    range: [25, 55],
    why: 'While berries ripen and are picked, keep the soil from getting too wet: waterlogging makes fruit drop early.',
  },
};

/** The handbook's target for coffee soil: 6.0 to 6.5, best near 6.2. */
const COFFEE_PH: ThresholdRange = [6.0, 6.5];

/** Degrees above the top of the crop's comfortable range at which heat starts to hurt. */
const HEAT_MARGIN_C = 5;

const VARIETY_LABEL: Record<Exclude<Variety, null>, string> = {
  arabica: 'Arabica coffee',
  robusta: 'Robusta coffee',
  mixed: 'Arabica & Robusta coffee',
};

/**
 * The profile for a farm or zone from its registered crop names. This is a coffee
 * app, so a farm with no crop recorded is treated as coffee of unknown variety.
 */
export function buildCropProfile(
  cropNames?: readonly (string | undefined)[] | null,
  /** The month (1-12) to set the soil water range for. Left out, the usual all-year range is used. */
  month: number | null = null,
): CropProfile {
  const names = (cropNames ?? []).filter((name): name is string => !!name?.trim());
  // All the coffee crops are read together, so a farm with both varieties gets the same
  // profile whichever is listed first (Arabica wins, as the more heat-sensitive).
  const coffeeNames = names.filter((name) => /coffee/i.test(name));
  const focus = coffeeNames.length ? coffeeNames.join(' ') : names[0] ?? '';
  const cropKey = resolveCropThresholdKeyFromLabel(focus);
  // The threshold lookup falls back to Arabica for any crop it does not know (mango, say), so
  // that alone is not proof of coffee: a farm with crops recorded must name a coffee one.
  const isCoffee =
    cropKey.startsWith('coffee') && (!names.length || names.some((name) => /coffee|arabica|robusta/i.test(name)));
  const ranges = CROP_THRESHOLDS[cropKey];
  const variety: Variety = isCoffee ? plantedSpecies(names.join(' ') || focus) : null;
  const season = isCoffee && month !== null ? SEASONAL_MOISTURE[coffeeStage(month, variety).kind] : undefined;

  return {
    cropKey,
    isCoffee,
    variety,
    label: isCoffee ? (variety ? VARIETY_LABEL[variety] : 'Coffee') : focus || 'Your farm',
    moisture: season?.range ?? ranges.moisture,
    moistureNote: season ? `${season.why} Best soil water now: ${season.range[0]}-${season.range[1]}%.` : null,
    month,
    ph: isCoffee ? COFFEE_PH : ranges.ph,
    temperature: ranges.temperature,
    nitrogen: ranges.nitrogen,
    phosphorus: ranges.phosphorus,
    potassium: ranges.potassium,
    hotLimitC: ranges.temperature[1] + HEAT_MARGIN_C,
  };
}

/** The profile for the devices in one zone: their own recorded crop, else the farm's. */
export function zoneProfile(sensors: DashboardSensorData[], farmProfile: CropProfile): CropProfile {
  const names = sensors.flatMap((sensor) => (sensor.crops ?? []).map((crop) => crop.name));
  return names.length ? buildCropProfile(names, farmProfile.month) : farmProfile;
}

export function levelOf(value: number | null, range: ThresholdRange): LevelState {
  if (value === null) return 'unknown';
  if (value < range[0]) return 'low';
  if (value > range[1]) return 'high';
  return 'ok';
}

// ---- Nutrients --------------------------------------------------------------

export type NutrientKey = 'nitrogen' | 'phosphorus' | 'potassium';

export interface NutrientLevel {
  key: NutrientKey;
  label: string;
  state: LevelState;
}

const NUTRIENT_LABEL: Record<NutrientKey, string> = {
  nitrogen: 'Nitrogen (N)',
  phosphorus: 'Phosphorus (P)',
  potassium: 'Potassium (K)',
};

function averagePositive(values: (number | null | undefined)[]): number | null {
  // A nutrient reading of 0 is a probe with nothing to report, not an empty soil.
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
}

/** Coffee takes up less phosphorus above pH 6, so its acceptable range drops there. */
export function phosphorusRange(profile: CropProfile, ph: number | null): ThresholdRange {
  return profile.isCoffee && ph !== null && ph > 6 ? [10, 25] : profile.phosphorus;
}

/**
 * Nitrogen, phosphorus and potassium for a set of devices, or null when no device
 * is reporting them. The server only releases nutrient values (isNpkDisplayed) when
 * the soil is moist enough for the probe to be trusted, so dry-soil readings are
 * never judged here.
 */
export function nutrientLevels(
  sensors: DashboardSensorData[],
  profile: CropProfile,
  ph: number | null,
): NutrientLevel[] | null {
  const trusted = sensors.filter((s) => s.moistureThresholdsResponse?.isNpkDisplayed === true);
  if (!trusted.length) return null;

  const averages: Record<NutrientKey, number | null> = {
    nitrogen: averagePositive(trusted.map((s) => s.soilNutrients?.nitrogen)),
    phosphorus: averagePositive(trusted.map((s) => s.soilNutrients?.phosphorous)),
    potassium: averagePositive(trusted.map((s) => s.soilNutrients?.potassium)),
  };
  if (Object.values(averages).every((v) => v === null)) return null;

  const ranges: Record<NutrientKey, ThresholdRange> = {
    nitrogen: profile.nitrogen,
    phosphorus: phosphorusRange(profile, ph),
    potassium: profile.potassium,
  };
  return (Object.keys(averages) as NutrientKey[]).map((key) => ({
    key,
    label: NUTRIENT_LABEL[key],
    state: levelOf(averages[key], ranges[key]),
  }));
}

// ---- Coffee calendar --------------------------------------------------------

export type StageKind = 'harvest' | 'maturing' | 'rest' | 'blossom' | 'fruitset' | 'before-monsoon' | 'monsoon';

export interface CoffeeStage {
  title: string;
  /** A name short enough for a dropdown. */
  short: string;
  /** What the crop is doing, which sets the colours and how much soil water it wants. */
  kind: StageKind;
  /** What growers usually do now, in the order they come up. */
  jobs: string[];
}

const stage = (kind: StageKind, short: string, title: string, jobs: string[]): CoffeeStage => ({ kind, short, title, jobs });

// The coffee year as the CCRI handbook gives it for South India. Arabica and Robusta follow
// different calendars (Arabica blossoms in March-April and is picked November-January; Robusta
// blossoms in February-March and is picked December-February), so each has its own table.
// Timing still moves with elevation and when the rains arrive, which is why jobs say "usually".

const MONSOON_BEGINS = stage('monsoon', 'Monsoon starts', 'Monsoon begins', [
  'Spray Bordeaux for black rot just before the rains set in, and keep the drains clear.',
  'Check leaves for rust and black rot (koleroga) during wet spells.',
]);
const MONSOON_JULY = stage('monsoon', 'Monsoon', 'Monsoon', [
  'Keep drains clear, and look for black rot (koleroga) in heavy rain.',
  'Keep the canopy open enough to dry between showers.',
]);
const MONSOON_AUGUST = stage('monsoon', 'Monsoon', 'Monsoon', [
  'Give the mid-monsoon fertiliser round in August.',
  'Watch green berries for the berry borer, and keep drains clear.',
]);
const LATE_MONSOON = stage('monsoon', 'Late monsoon', 'Late monsoon, berries filling', [
  'Give the post-monsoon fertiliser round (September-October, rich in potash for filling the beans) when the rains ease.',
  'Spray against leaf rust after the monsoon (Bordeaux or a systemic spray, September-October).',
  'Inspect berry tips for the berry borer.',
]);
const HARVEST_ROUNDS = (rounds: string) =>
  stage('harvest', 'Harvest', 'Harvest', [
    `Pick ripe cherries only, in ${rounds}.`,
    'Pulp within six hours of picking, dry quickly, and cover the yards if rain is coming.',
    'Gather fallen berries. Soil lime can go on from November, a month apart from fertiliser.',
  ]);

const ARABICA_STAGES: Record<number, CoffeeStage> = {
  1: stage('harvest', 'End of harvest', 'Last of the harvest', [
    'Finish picking, and strip and remove left-over berries from the trees and the ground: they carry the berry borer to the next crop.',
    'Start pruning three to four weeks after picking, never on dry soil.',
    'From 16 January, check that you can give blossom watering when it is needed.',
  ]),
  2: stage('rest', 'Pruning', 'Pruning and getting ready to flower', [
    'Finish pruning (January-February), never on dry soil.',
    'Arabica flowers after a shower of 25-40 mm, usually in March-April. Have blossom watering ready in case it is late.',
    'Check for mealybugs: they build up in dry weather from February to May.',
  ]),
  3: stage('blossom', 'Flowering', 'Flowering', [
    'Blossom showers usually come in March-April. If none comes by the end of April, give blossom watering (25-40 mm).',
    'Give the post-blossom fertiliser round in March-April.',
    'Check for mealybugs in dry weather.',
  ]),
  4: stage('blossom', 'Flowering', 'Flowering and fruit set', [
    'Give blossom watering by 30 April if no shower has come.',
    'Give backing watering (about 25 mm) within a month of the blossom rain: a late backing shower hurts fruit set.',
    'White stem borer adults fly in April-May: trace and remove infested plants.',
  ]),
  5: stage('fruitset', 'Fruit set', 'Fruit set, before the monsoon', [
    'Give backing watering if the backing shower has not come within a month of the blossom rain.',
    'Give the pre-monsoon fertiliser (May-June) once the first good rains have come.',
    'Spray Bordeaux for leaf rust before the monsoon, clean the drains, and regulate shade.',
  ]),
  6: MONSOON_BEGINS,
  7: MONSOON_JULY,
  8: MONSOON_AUGUST,
  9: LATE_MONSOON,
  10: stage('maturing', 'Berries maturing', 'Berries maturing', [
    'Finish the post-monsoon spray and fertiliser.',
    'White stem borer adults fly from October to December, and shot-hole borer is active from September to January.',
    'Get picking crews, drying yards and equipment ready for November.',
  ]),
  11: HARVEST_ROUNDS('two to three rounds'),
  12: HARVEST_ROUNDS('two to three rounds'),
};

const ROBUSTA_STAGES: Record<number, CoffeeStage> = {
  1: stage('harvest', 'Harvest', 'Harvest', [
    'Pick ripe cherries only, in one or two rounds.',
    'Pulp within six hours of picking, dry quickly, and cover the yards if rain is coming.',
    'From 16 January, check that you can give blossom watering when it is needed.',
  ]),
  2: stage('blossom', 'End of harvest', 'Last of the harvest, flowering near', [
    'Finish picking, and gather left-over berries, then prune once picking is done.',
    'Robusta flowers after a shower of 25-40 mm, usually in February-March. If none comes, give blossom watering, by 31 March at the latest.',
  ]),
  3: stage('blossom', 'Flowering', 'Flowering', [
    'Give blossom watering by 31 March if no shower has come.',
    'Give backing watering within three weeks of the blossom rain.',
    'Give the post-blossom fertiliser round in March-April.',
  ]),
  4: stage('fruitset', 'Fruit set', 'Fruit set', [
    'Give backing watering (about 25 mm) within 20-25 days of the blossom rain: a late backing shower hurts fruit set.',
    'Keep the soil moist while the berries set.',
  ]),
  5: stage('before-monsoon', 'Before monsoon', 'Before the monsoon', [
    'Give the pre-monsoon fertiliser (May-June) once the first good rains have come.',
    'Spray Bordeaux for rust and black rot before the rains, clean the drains, and regulate shade.',
  ]),
  6: MONSOON_BEGINS,
  7: MONSOON_JULY,
  8: MONSOON_AUGUST,
  9: stage('monsoon', 'Late monsoon', 'Late monsoon, berries filling', [
    'Give the post-monsoon fertiliser round (September-October, rich in potash) when the rains ease.',
    'Spray against leaf rust after the monsoon (Bordeaux or a systemic spray, September-October).',
    'Shot-hole borer starts now: inspect tender twigs and prune below any hole.',
  ]),
  10: stage('maturing', 'Berries maturing', 'Berries maturing', [
    'Robusta berries fill and ripen slowly: picking usually starts in December.',
    'Shot-hole borer is active from September to January: inspect tender twigs.',
    'Get picking crews, drying yards and equipment ready.',
  ]),
  11: stage('maturing', 'Berries maturing', 'Berries maturing', [
    'Picking usually starts next month: get crews, pulpers and drying yards ready.',
    'Keep checking tender twigs for shot-hole borer. Soil lime can go on from November, a month apart from fertiliser.',
  ]),
  12: stage('harvest', 'Harvest', 'Harvest begins', [
    'Pick ripe cherries only, in one or two rounds.',
    'Pulp within six hours of picking, dry quickly, and cover the yards if rain is coming.',
    'Gather fallen berries.',
  ]),
};

// A farm with both, or no variety recorded: the months where the two differ say so.
const MIXED_STAGES: Record<number, CoffeeStage> = {
  ...ARABICA_STAGES,
  1: stage('harvest', 'Harvest', 'Harvest', [
    'Pick ripe cherries only. Robusta is at its main picking and Arabica is finishing.',
    'Strip and remove left-over Arabica berries from the trees and the ground to starve the berry borer.',
    'From 16 January, check that you can give blossom watering when it is needed.',
  ]),
  2: stage('blossom', 'Flowering starts', 'Harvest ends, flowering starts', [
    'Finish picking, and gather left-over berries, then prune once picking is done.',
    'Robusta flowers after a shower of 25-40 mm in February-March, Arabica in March-April. Have blossom watering ready.',
  ]),
  3: stage('blossom', 'Flowering', 'Flowering', [
    'Give blossom watering if no shower has come: by 31 March for Robusta, by 30 April for Arabica.',
    'Give backing watering within three weeks (Robusta) or a month (Arabica) of the blossom rain.',
    'Give the post-blossom fertiliser round in March-April.',
  ]),
  4: stage('blossom', 'Flowering', 'Flowering and fruit set', [
    'Arabica: give blossom watering by 30 April if no shower has come.',
    'Robusta: give backing watering within 20-25 days of the blossom rain.',
    'White stem borer adults (Arabica) fly in April-May: trace and remove infested plants.',
  ]),
  10: stage('maturing', 'Berries maturing', 'Berries maturing', [
    'Finish the post-monsoon spray and fertiliser.',
    'White stem borer (Arabica) flies from October to December, and shot-hole borer (Robusta) is active from September to January.',
    'Get picking crews, drying yards and equipment ready: Arabica picking starts in November, Robusta in December.',
  ]),
  11: stage('harvest', 'Harvest begins', 'Harvest begins', [
    'Pick ripe Arabica cherries only, in rounds. Robusta is not ready until December.',
    'Pulp within six hours of picking, dry quickly, and cover the yards if rain is coming.',
    'Gather fallen berries.',
  ]),
};

/** The ten stage names from the farm app (docs/changes.md, section 1). */
const STAGE_NAMES = {
  budDevelopment: 'Flower Bud Development and Dormancy',
  flowering: 'Flowering / Blossom',
  fruitSet: 'Fruit Set / Pinhead Stage',
  berryExpansion: 'Berry Expansion',
  beanFilling: 'Bean Development and Filling',
  ripening: 'Fruit Maturation and Ripening',
  harvesting: 'Harvesting',
  postHarvest: 'Post-Harvest Recovery and Renewal',
} as const;

// Each month takes the stage that covers most of its days when the year is counted from the usual
// blossom date (25 March Arabica, 25 February Robusta). The month holding that date is named
// Flowering. A farm with both varieties, or none recorded, uses Arabica's year, as the farm app does.
const ARABICA_STAGE_NAMES: Record<number, string> = {
  1: STAGE_NAMES.harvesting,
  2: STAGE_NAMES.postHarvest,
  3: STAGE_NAMES.flowering,
  4: STAGE_NAMES.fruitSet,
  5: STAGE_NAMES.berryExpansion,
  6: STAGE_NAMES.berryExpansion,
  7: STAGE_NAMES.berryExpansion,
  8: STAGE_NAMES.beanFilling,
  9: STAGE_NAMES.beanFilling,
  10: STAGE_NAMES.ripening,
  11: STAGE_NAMES.ripening,
  12: STAGE_NAMES.harvesting,
};

const ROBUSTA_STAGE_NAMES: Record<number, string> = {
  1: STAGE_NAMES.harvesting,
  2: STAGE_NAMES.flowering,
  3: STAGE_NAMES.fruitSet,
  4: STAGE_NAMES.berryExpansion,
  5: STAGE_NAMES.berryExpansion,
  6: STAGE_NAMES.berryExpansion,
  7: STAGE_NAMES.berryExpansion,
  8: STAGE_NAMES.berryExpansion,
  9: STAGE_NAMES.berryExpansion,
  10: STAGE_NAMES.beanFilling,
  11: STAGE_NAMES.ripening,
  12: STAGE_NAMES.harvesting,
};

export function coffeeStage(month: number, variety: Variety = null): CoffeeStage {
  const table = variety === 'arabica' ? ARABICA_STAGES : variety === 'robusta' ? ROBUSTA_STAGES : MIXED_STAGES;
  const names = variety === 'robusta' ? ROBUSTA_STAGE_NAMES : ARABICA_STAGE_NAMES;
  const name = names[month] ?? names[1];
  return { ...(table[month] ?? table[1]), title: name, short: name };
}

export interface WatchTopic {
  topic: string;
  title: string;
  /** What to look for in the field. */
  message: string;
}

interface WatchEntry {
  topic: string;
  title: string;
  /** What a grower can check by eye in the field. */
  signs: string;
  /** Calendar months (1-12) the topic is on the list. */
  months: readonly number[];
  /** Set when the problem only attacks one variety. */
  onlyAttacks?: 'arabica' | 'robusta';
}

/**
 * The dashboard's seasonal scouting hints, in the order they are shown. This is the farm app's
 * own list (crop_config.json, farmToday.coffee.watchTopics), kept in step with it: it has its own
 * month lists, separate from the forecast calendar in the pest model. Topic ids are the web's
 * (`cwsb` is the app's `wsb`).
 */
const COFFEE_WATCH: readonly WatchEntry[] = [
  {
    topic: 'cwsb',
    title: 'White stem borer',
    signs: 'Look for sawdust-like frass at the base of the stem, bark scars, and plants that yellow or wilt.',
    months: [3, 4, 5, 9, 10, 11, 12],
    onlyAttacks: 'arabica',
  },
  {
    topic: 'rust',
    title: 'Leaf rust',
    signs: 'Look for orange powder under the leaves and pale yellow spots on top.',
    months: [6, 7, 8, 9, 10, 11, 12, 1, 2],
    onlyAttacks: 'arabica',
  },
  {
    topic: 'blackrot',
    title: 'Black rot / koleroga',
    signs: 'Look for blackened, rotting leaves and berries hanging in clusters after wet, misty weather.',
    months: [6, 7, 8, 9],
  },
  {
    topic: 'berryborer',
    title: 'Coffee berry borer',
    signs: 'Look for a tiny hole at the tip of the berry. Pick and destroy the berries that have it.',
    months: [6, 7, 8, 9, 10, 11, 12, 1, 2, 3],
  },
  {
    topic: 'shothole',
    title: 'Shot-hole borer',
    signs: 'Look for tiny holes in tender twigs, and shoots that dry out.',
    months: [9, 10, 11, 12, 1, 2, 3, 4],
    onlyAttacks: 'robusta',
  },
  {
    topic: 'mealybug',
    title: 'Mealybugs and scale insects',
    signs: 'Look for white, cottony clusters on nodes, berries and roots, often with ants.',
    months: [2, 3, 4, 5],
  },
  {
    topic: 'root',
    title: 'Root health',
    signs: 'Look for plants wilting even though the soil is wet, and check the roots and drains.',
    months: [6, 7, 8, 9, 10, 11],
  },
  {
    topic: 'heat',
    title: 'Heat and dry plants',
    signs: 'Check exposed rows and young plants for scorched leaves.',
    months: [2, 3, 4, 5, 6],
  },
  {
    topic: 'canopy',
    title: 'Shade and pruning',
    signs: 'Check that the shade and canopy are open enough for the leaves to dry.',
    months: [6, 7, 8, 9, 12, 1, 2],
  },
];

/**
 * The pest and disease hints for a month (1-12) and planting, in the list's own order. A problem
 * that only attacks the other variety (shot-hole borer on Arabica, for example) is left out; a mixed
 * or unknown planting never excludes anything. The dashboard shows the first few.
 */
export function coffeeWatchTopics(month: number, variety: Variety): WatchTopic[] {
  return COFFEE_WATCH.filter(
    (entry) => entry.months.includes(month) && (!entry.onlyAttacks || variety !== (entry.onlyAttacks === 'arabica' ? 'robusta' : 'arabica')),
  ).map(({ topic, title, signs }) => ({ topic, title, message: signs }));
}
