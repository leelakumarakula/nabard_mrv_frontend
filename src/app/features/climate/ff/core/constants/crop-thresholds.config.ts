export type ThresholdKey =
  | 'temperature'
  | 'humidity'
  | 'moisture'
  | 'lux'
  | 'solarRadiation'
  | 'nitrogen'
  | 'phosphorus'
  | 'potassium'
  | 'ec'
  | 'ph';

export type CropThresholdKey =
  | 'coffee-arabica'
  | 'coffee-robusta'
  | 'pepper-panniyur'
  | 'pepper-karimunda'
  | 'arecanut-chali'
  | 'arecanut-thirthahalli'
  | 'chilli'
  | 'watermelon'
  | 'tea-assamica'
  | 'tea-sinensis';

export type ThresholdRange = [number, number];
export type ThresholdMap = Record<ThresholdKey, ThresholdRange>;

export const CROP_THRESHOLDS: Record<CropThresholdKey, ThresholdMap> = {
  'coffee-arabica': {
    temperature: [15, 25],
    humidity: [70, 80],
    moisture: [30, 60],
    lux: [10000, 30000],
    solarRadiation: [150, 300],
    nitrogen: [280, 560],
    phosphorus: [22, 45],
    potassium: [108, 278],
    ec: [2000, 4000],
    ph: [6, 6.5],
  },

  'coffee-robusta': {
    temperature: [20, 30],
    humidity: [80, 90],
    moisture: [30, 60],
    lux: [15000, 40000],
    solarRadiation: [200, 400],
    nitrogen: [280, 560],
    phosphorus: [22, 45],
    potassium: [108, 278],
    ec: [2000, 4000],
    ph: [6, 6.5],
  },

  'pepper-panniyur': {
    temperature: [18, 32],
    humidity: [40, 70],
    moisture: [0, 60],
    lux: [1000, 5000],
    solarRadiation: [200, 800],
    nitrogen: [240, 480],
    phosphorus: [11, 22],
    potassium: [110, 280],
    ec: [0, 1000],
    ph: [5.5, 6.5],
  },

  'pepper-karimunda': {
    temperature: [18, 32],
    humidity: [40, 70],
    moisture: [0, 60],
    lux: [1000, 5000],
    solarRadiation: [200, 800],
    nitrogen: [240, 450],
    phosphorus: [11, 20],
    potassium: [110, 280],
    ec: [0, 1500],
    ph: [5, 6.5],
  },

  'arecanut-thirthahalli': {
    temperature: [20, 32],
    humidity: [50, 80],
    moisture: [0, 60],
    lux: [1000, 5000],
    solarRadiation: [200, 800],
    nitrogen: [240, 480],
    phosphorus: [11, 22],
    potassium: [110, 280],
    ec: [0, 1000],
    ph: [5.2, 7],
  },

  'arecanut-chali': {
    temperature: [20, 32],
    humidity: [50, 80],
    moisture: [0, 60],
    lux: [1000, 5000],
    solarRadiation: [200, 800],
    nitrogen: [0, 280],
    phosphorus: [0, 40],
    potassium: [0, 300],
    ec: [0, 1.5],
    ph: [5.5, 6.5],
  },

  chilli: {
    temperature: [22, 25],
    humidity: [60, 80],
    moisture: [25, 30],
    lux: [0, 0],
    solarRadiation: [0, 0],
    nitrogen: [80, 100],
    phosphorus: [40, 50],
    potassium: [50, 60],
    ec: [0.2, 0.3],
    ph: [6.5, 7],
  },

  watermelon: {
    temperature: [24, 35],
    humidity: [60, 80],
    moisture: [22, 32],
    lux: [0, 0],
    solarRadiation: [0, 0],
    nitrogen: [240, 340],
    phosphorus: [28, 65],
    potassium: [180, 360],
    ec: [0.1, 2],
    ph: [6, 7],
  },

  'tea-assamica': {
    temperature: [18, 30],
    humidity: [70, 90],
    moisture: [30, 60],
    lux: [10000, 25000],
    solarRadiation: [150, 300],
    nitrogen: [200, 300],
    phosphorus: [60, 100],
    potassium: [100, 200],
    ec: [200, 1000],
    ph: [4.5, 5.5],
  },

  'tea-sinensis': {
    temperature: [15, 25],
    humidity: [70, 90],
    moisture: [30, 60],
    lux: [10000, 25000],
    solarRadiation: [150, 300],
    nitrogen: [200, 300],
    phosphorus: [60, 100],
    potassium: [100, 200],
    ec: [200, 1000],
    ph: [4.5, 5.5],
  },
};

export function resolveCropThresholdKeyFromLabel(
  cropLabel: string | undefined,
): CropThresholdKey {
  const normalized = cropLabel?.toLowerCase() ?? '';

  if (normalized.includes('coffee') && normalized.includes('arabica')) {
    return 'coffee-arabica';
  }
  if (normalized.includes('coffee') && normalized.includes('robusta')) {
    return 'coffee-robusta';
  }
  if (normalized.includes('pepper') && normalized.includes('karimunda')) {
    return 'pepper-karimunda';
  }
  if (normalized.includes('pepper')) {
    return 'pepper-panniyur';
  }
  if (normalized.includes('areca') && normalized.includes('thirthahalli')) {
    return 'arecanut-thirthahalli';
  }
  if (normalized.includes('areca')) {
    return 'arecanut-chali';
  }
  if (normalized.includes('chilli')) {
    return 'chilli';
  }
  if (normalized.includes('watermelon')) {
    return 'watermelon';
  }
  if (normalized.includes('tea') && normalized.includes('sinensis')) {
    return 'tea-sinensis';
  }
  if (normalized.includes('tea')) {
    return 'tea-assamica';
  }

  return 'coffee-arabica';
}
