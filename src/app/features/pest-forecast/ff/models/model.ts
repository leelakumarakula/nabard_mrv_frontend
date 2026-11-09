// @ts-nocheck
// Ported unchanged from Coffee-estate-twin/public/model.js. Keep the logic byte-identical: the Node
// test suites and the Python backend parity test run against the original module.
export const ANCHOR = Object.freeze({ lat: 11.99778, long: 76.050937 });

export const STAGES = [
  { name: 'Seed & nursery', short: 'Nursery', category: 'ESTABLISHMENT · BEFORE FIELD PLANTING', description: 'A young coffee plant develops its first paired leaves and a small root system under nursery care.', biology: 'Seedling leaves and roots establish before transplanting.', action: 'Track nursery batches, shade, watering and seedling condition.', evidence: 'Sowing date, nursery records and seedling photographs.', scale: .18 },
  { name: 'Field establishment', short: 'Planting', category: 'ESTABLISHMENT · FIRST YEARS', description: 'Young plants are transplanted into the estate. Their root system and canopy begin to occupy the planting space.', biology: 'Root establishment and new vegetative growth.', action: 'Record planting date, spacing, shade and survival.', evidence: 'Plant inventory, planting map and survival counts.', scale: .36 },
  { name: 'Vegetative growth', short: 'Growth', category: 'ESTABLISHMENT · FIRST YEARS', description: 'The perennial shrub builds its trunk, branches and leaf area before a productive crop cycle is established.', biology: 'New nodes and lateral branches develop.', action: 'Record plant growth, training, shade and nutrition management.', evidence: 'Plant age, canopy measurements and field inspection.', scale: .67 },
  { name: 'Bud development', short: 'Buds', category: 'REPEATING CROP SEASON', description: 'An established coffee plant develops flower buds. Timing depends on species, weather and the history of the plant.', biology: 'Buds form at nodes along productive branches.', action: 'Observe bud condition and record rain or irrigation events.', evidence: 'Bud inspections and dated rain / irrigation records.', scale: 1 },
  { name: 'Flowering', short: 'Flowering', category: 'REPEATING CROP SEASON', description: 'White flowers open in clusters along the branches. The actual flowering date becomes a key anchor for this crop season.', biology: 'Flowers open; pollination precedes fruit development.', action: 'Record flowering events and inspect the plants.', evidence: 'Dated flower photographs and block-level observations.', scale: 1 },
  { name: 'Fruit set', short: 'Fruit set', category: 'REPEATING CROP SEASON', description: 'After flowering, small green fruits remain at successful fruiting nodes. Not every flower becomes a harvested cherry.', biology: 'Small green fruits develop after flower drop.', action: 'Track fruit set and losses in representative sample plants.', evidence: 'Fruit counts and field notes, alongside weather readings.', scale: 1 },
  { name: 'Cherry & bean growth', short: 'Bean fill', category: 'REPEATING CROP SEASON', description: 'Green cherries enlarge while seeds develop inside. The animation illustrates development; it does not estimate your yield.', biology: 'Fruit expansion and internal seed development.', action: 'Observe crop condition and record water and nutrient inputs.', evidence: 'Repeated sample counts, fruit size and management logs.', scale: 1 },
  { name: 'Cherry ripening', short: 'Ripening', category: 'REPEATING CROP SEASON', description: 'Cherries change colour as they mature. Ripening can vary between plants and within a branch.', biology: 'Green fruit progresses toward cultivar-specific ripe colour.', action: 'Inspect maturity and plan picking by field observations.', evidence: 'Cherry photographs, maturity sampling and harvest checks.', scale: 1 },
  { name: 'Selective harvest', short: 'Harvest', category: 'REPEATING CROP SEASON', description: 'Ripe cherries are picked while the coffee tree remains in place for future seasons.', biology: 'Fruit is removed; the perennial plant remains.', action: 'Record harvested mass, dates and traceable lot identity.', evidence: 'Weighing records and ripe / unripe sample counts.', scale: 1 },
  { name: 'Sorting & processing', short: 'Processing', category: 'POST-HARVEST · BATCH JOURNEY', description: 'Harvested cherries enter a processing batch. Natural and washed methods take different routes to green coffee.', biology: 'Cherry and seed handling replaces field crop development.', action: 'Choose the batch method and record handling steps.', evidence: 'Lot ID, method, mass, start times and process checks.', scale: 1 },
  { name: 'Drying', short: 'Drying', category: 'POST-HARVEST · BATCH JOURNEY', description: 'Whole cherries or parchment coffee dry under controlled handling. Soil probes do not measure bean moisture.', biology: 'Water leaves the harvested material.', action: 'Measure product moisture and record drying conditions.', evidence: 'A calibrated coffee-moisture meter and batch records.', scale: 1 },
  { name: 'Curing & storage', short: 'Storage', category: 'POST-HARVEST · BATCH JOURNEY', description: 'Dried coffee is hulled, graded and stored as traceable green coffee. Quality requires direct checks.', biology: 'Protect the dried product from moisture and damage.', action: 'Record grade, moisture, storage conditions and lot movement.', evidence: 'Curing records, moisture readings and quality results.', scale: 1 },
  { name: 'Care & next season', short: 'Next season', category: 'PERENNIAL CYCLE · CONTINUES', description: 'The established plants continue into another season. Post-harvest care and branch renewal follow the estate’s actual schedule.', biology: 'Retained plants produce new vegetative and reproductive growth.', action: 'Record pruning, shade work, inputs and the next bud cycle.', evidence: 'Management logs and the next observed flowering date.', scale: .92 }
];

export const SOIL = Object.freeze({ depth: [300, 300, 400], theta: [.24, .26, .27], fc: [.32, .34, .36], sat: [.44, .46, .48], wp: [.12, .15, .17] });

// Educational daily, three-layer bucket model. All water quantities are mm
// over the same horizontal area. This is not a calibrated coffee crop model.
export function waterDay({ rain = 20, irrigation = 0, demand = 4, mulch = false } = {}) {
  for (const [key, value, max] of [['rain', rain, 100], ['irrigation', irrigation, 50], ['demand', demand, 8]]) {
    if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`Invalid ${key}`);
  }
  const s = SOIL.theta.map((v, i) => v * SOIL.depth[i]);
  const initial = s.reduce((a,b) => a + b, 0);
  const interception = .12 * rain;
  const atSurface = rain - interception + irrigation;
  const runoff = Math.max(0, atSurface - 35);
  const infiltration = atSurface - runoff;
  let incoming = infiltration;
  let drainage = 0;
  const transfer = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    s[i] += incoming;
    const overflow = Math.max(0, s[i] - SOIL.sat[i] * SOIL.depth[i]);
    s[i] -= overflow;
    const gravity = Math.max(0, s[i] - SOIL.fc[i] * SOIL.depth[i]) * .45;
    s[i] -= gravity;
    incoming = overflow + gravity;
    transfer[i] = incoming;
  }
  drainage = incoming;
  const evaporation = Math.min(Math.max(0, s[0] - SOIL.wp[0] * SOIL.depth[0]), demand * .4 * (mulch ? .45 : 1));
  s[0] -= evaporation;
  let transpiration = 0;
  [.55, .35, .10].forEach((weight,i) => {
    const uptake = Math.min(Math.max(0, s[i] - SOIL.wp[i] * SOIL.depth[i]), demand * .6 * weight);
    s[i] -= uptake;
    transpiration += uptake;
  });
  const final = s.reduce((a,b) => a+b,0);
  const et = evaporation + transpiration;
  const residual = initial + rain + irrigation - final - interception - runoff - drainage - et;
  return { initial, rain, irrigation, interception, runoff, infiltration, transfer, evaporation, transpiration, et, drainage, final, residual, layers: s, theta: s.map((v,i)=>v/SOIL.depth[i]), mulch };
}

export function validateObservation(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Use one JSON object.');
  if (typeof raw.device_id !== 'string' || !raw.device_id.trim() || raw.device_id.length > 100) throw new Error('Add a device_id (1–100 characters).');
  if (typeof raw.observed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw.observed_at)) throw new Error('observed_at must be an ISO timestamp with a timezone, such as 2026-09-17T10:25:00+05:30.');
  const time = Date.parse(raw.observed_at);
  if (!Number.isFinite(time) || time > now + 300000) throw new Error('The observation timestamp is invalid or in the future.');
  const parts = raw.observed_at.slice(0,19).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/).slice(1).map(v=>Number(v||0));
  const [year,month,day,hour,minute,second] = parts;
  const calendarCheck = new Date(Date.UTC(year,month-1,day,hour,minute,second));
  if (calendarCheck.getUTCFullYear()!==year || calendarCheck.getUTCMonth()!==month-1 || calendarCheck.getUTCDate()!==day || hour>23 || minute>59 || second>59) throw new Error('The timestamp contains an invalid calendar date or time.');
  if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.long)) throw new Error('Add numeric lat and long values for this device.');
  const north = (raw.lat - ANCHOR.lat) * 111320;
  const east = (raw.long - ANCHOR.long) * 111320 * Math.cos(ANCHOR.lat * Math.PI / 180);
  if (Math.hypot(north,east) > 50) throw new Error('This record is more than 50 m from the supplied device anchor. Check the device mapping.');
  const result = { device_id: raw.device_id.trim(), observed_at: raw.observed_at, lat:raw.lat, long:raw.long };
  const ranges = {soil_moisture_20cm_pct:[0,100],soil_moisture_60cm_pct:[0,100],soil_temperature_c:[-20,80],rainfall_mm:[0,2000],rainfall_interval_minutes:[1,44640]};
  for (const [key, [low, high]] of Object.entries(ranges)) {
    const val = raw[key];
    if (val === null || val === undefined) { result[key]=null; continue; }
    if (typeof val !== 'number' || !Number.isFinite(val) || val < low || val > high) throw new Error(`${key} must be a number between ${low} and ${high}, or null.`);
    result[key]=val;
  }
  if (result.rainfall_mm !== null && result.rainfall_interval_minutes === null) throw new Error('Add rainfall_interval_minutes for the reported rainfall amount.');
  if (['soil_moisture_20cm_pct','soil_moisture_60cm_pct','soil_temperature_c','rainfall_mm'].every(k=>result[k]===null)) throw new Error('Add at least one available sensor reading.');
  return result;
}
