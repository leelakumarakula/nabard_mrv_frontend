import { Injectable } from '@angular/core';

export enum CorrelationStrength {
  strongPositive = 'strongPositive',
  moderatePositive = 'moderatePositive',
  weak = 'weak',
  moderateNegative = 'moderateNegative',
  strongNegative = 'strongNegative',
}

export interface FarmCorrelationResult {
  sensorParam: string;
  weatherParam: string;
  coefficient: number;
  strength: CorrelationStrength;
  overlappingDays: number;
  description: string;
  recommendations: string[];
}

export enum CorrelationStoryType {
  waterDependency = 'waterDependency',
  fieldConsistency = 'fieldConsistency',
  moistureDryDays = 'moistureDryDays',
  nutrientLock = 'nutrientLock',
  npkTotal = 'npkTotal',
  npkBalance = 'npkBalance',
  nutrientUptake = 'nutrientUptake',
  evaporationStress = 'evaporationStress',
  thermalInversion = 'thermalInversion',
  evaporationRate = 'evaporationRate',
  rootSalinity = 'rootSalinity',
  saltFlushing = 'saltFlushing',
  rootStress = 'rootStress',
  soilHealthAll = 'soilHealthAll',
  weatherSoilSummary = 'weatherSoilSummary',
}

export interface CorrelationStoryConfig {
  type: CorrelationStoryType;
  title: string;
  question: string;
  impactStatement: string;
  soilParams?: string[];
  weatherParams?: string[];
  icon: string;
  color: string;
}

export const CORRELATION_STORIES: CorrelationStoryConfig[] = [
  {
    type: CorrelationStoryType.waterDependency,
    title: 'Rain vs. Soil Moisture',
    question: 'Was my field getting enough water?',
    impactStatement: 'Your soil moisture closely followed the rainfall this period. When rain stopped, soil started drying within 3 days. This tells you how dependent your field is on rain and how quickly it loses water.',
    weatherParams: ['rainfall'],
    soilParams: ['soilMoisturePercentage1', 'soilMoisturePercentage2'],
    icon: 'water_drop',
    color: '#2196F3',
  },
  {
    type: CorrelationStoryType.fieldConsistency,
    title: 'Site Comparison',
    question: 'Is my whole field affected equally?',
    impactStatement: 'Both parts of your field were dry this period, but the back section dried out faster and went lower. This means one part of your field holds water better than the other.',
    soilParams: ['soilMoisturePercentage1', 'soilMoisturePercentage2'],
    icon: 'compare_arrows',
    color: '#009688',
  },
  {
    type: CorrelationStoryType.moistureDryDays,
    title: 'Dry Spell Track',
    question: 'How long was my crop without water?',
    impactStatement: 'It rained very little this period. As a result, soil stayed dry for most of the days. This is the longest dry stretch recorded for this field.',
    weatherParams: ['rainfall'],
    soilParams: ['soilMoisturePercentage1'],
    icon: 'warning_amber',
    color: '#FF9800',
  },
  {
    type: CorrelationStoryType.nutrientLock,
    title: 'pH & Nitrogen Lock',
    question: 'Could my crop actually use the nutrients?',
    impactStatement: 'Your soil pH was slightly outside the ideal range this period. Even if nitrogen was present, your crop could not absorb it fully. pH controls whether nutrients are usable or locked in the soil.',
    soilParams: ['ph', 'nitrogen'],
    icon: 'lock_outline',
    color: '#673AB7',
  },
  {
    type: CorrelationStoryType.npkTotal,
    title: 'Full Nutrient Access',
    question: 'Full nutrient availability picture',
    impactStatement: 'Phosphorus and potassium levels were present but your pH shifted this period. When pH goes off, all three nutrients become harder for the plant to absorb even if the soil has them.',
    soilParams: ['ph', 'nitrogen', 'phosphorous', 'potassium'],
    icon: 'science',
    color: '#3F51B5',
  },
  {
    type: CorrelationStoryType.npkBalance,
    title: 'NPK Balance',
    question: 'Which nutrients were missing?',
    impactStatement: 'Nitrogen was low this period while phosphorus was normal and potassium was on the lower side. When nitrogen and potassium drop together, plant growth and fruit quality both suffer at the same time.',
    soilParams: ['nitrogen', 'phosphorous', 'potassium'],
    icon: 'balance',
    color: '#4CAF50',
  },
  {
    type: CorrelationStoryType.nutrientUptake,
    title: 'Water & Nutrients',
    question: 'Was dryness blocking nutrients?',
    impactStatement: 'Soil was too dry for most of this period. Even where nutrients were present, dry soil means roots struggle to absorb them. Your crop was under nutrient stress even without a nutrient deficiency.',
    soilParams: ['soilMoisturePercentage1', 'nitrogen', 'phosphorous', 'potassium'],
    icon: 'waves',
    color: '#607D8B',
  },
  {
    type: CorrelationStoryType.evaporationStress,
    title: 'Heat & Humidity Stress',
    question: 'How hard was the air pulling water from crop?',
    impactStatement: 'Temperature was high and humidity was low together for several days this period. This combination pulls water out of the plant faster than the roots can replace it even if soil had some moisture.',
    weatherParams: ['airTemperature', 'airHumidity'],
    icon: 'hot_tub',
    color: '#F44336',
  },
  {
    type: CorrelationStoryType.thermalInversion,
    title: 'Ground vs. Air Heat',
    question: 'Did ground heat stress the roots?',
    impactStatement: 'Air temperature rose significantly this period and soil temperature followed 1 to 2 days later. Warm soil speeds up moisture evaporation and can stress shallow roots during the hottest days.',
    weatherParams: ['airTemperature'],
    soilParams: ['temperature'],
    icon: 'thermostat',
    color: '#FF5722',
  },
  {
    type: CorrelationStoryType.evaporationRate,
    title: 'Extreme Evaporation',
    question: 'Which days had highest evaporation?',
    impactStatement: 'On the hottest days, wind was also strong and humidity was low. This combination creates very high evaporation and your field lost more moisture on these days than on other hot days.',
    weatherParams: ['windSpeed', 'airTemperature', 'airHumidity'],
    icon: 'air',
    color: '#2196F3',
  },
  {
    type: CorrelationStoryType.rootSalinity,
    title: 'Salt Concentration',
    question: 'Double root stress days',
    impactStatement: 'When soil moisture was very low, salinity levels were comparatively higher. This is because salts concentrate when water evaporates. Roots were both dry and salty at the same time.',
    soilParams: ['electricalConductivity', 'soilMoisturePercentage1'],
    icon: 'grain',
    color: '#795548',
  },
  {
    type: CorrelationStoryType.saltFlushing,
    title: 'Rain & Salt Flush',
    question: 'Did rain help flush out salts?',
    impactStatement: 'Salinity spiked during the dry spell and came down slightly after rain. Rain helps flush out excess salts. This period had too little rain to keep salinity in check.',
    weatherParams: ['rainfall'],
    soilParams: ['electricalConductivity'],
    icon: 'cleaning_services',
    color: '#00BCD4',
  },
  {
    type: CorrelationStoryType.rootStress,
    title: 'Critical Root Stress',
    question: 'Worst stress days for roots',
    impactStatement: 'On days when soil was both warm and dry, your crop was under the highest stress of the period. Warm dry soil loses moisture fastest and is hardest on root systems.',
    soilParams: ['temperature', 'soilMoisturePercentage1'],
    icon: 'priority_high',
    color: '#FF5252',
  },
  {
    type: CorrelationStoryType.soilHealthAll,
    title: 'Soil Health Full Picture',
    question: 'Full soil health picture',
    impactStatement: 'Looking at the full picture, soil was dry, nitrogen and potassium were low, and pH was slightly off. These three problems together during the same period compound each other.',
    soilParams: ['ph', 'nitrogen', 'phosphorous', 'potassium', 'soilMoisturePercentage1'],
    icon: 'grid_view',
    color: '#795548',
  },
  {
    type: CorrelationStoryType.weatherSoilSummary,
    title: 'Season Summary',
    question: 'What caused what this period?',
    impactStatement: 'Weather was the main driver of problems this period. Low rainfall led to dry soil, dry soil reduced nutrient absorption, and high temperatures made it worse.',
    weatherParams: ['rainfall', 'airTemperature'],
    soilParams: ['soilMoisturePercentage1', 'nitrogen'],
    icon: 'summarize',
    color: '#607D8B',
  },
];

const STORY_CONFIG_MAP: Record<CorrelationStoryType, CorrelationStoryConfig> = CORRELATION_STORIES.reduce((acc, story) => {
  acc[story.type] = story;
  return acc;
}, {} as Record<CorrelationStoryType, CorrelationStoryConfig>);

@Injectable({
  providedIn: 'root'
})
export class FarmInsightsEngineService {
  getStoryConfig(type: CorrelationStoryType): CorrelationStoryConfig | null {
    return STORY_CONFIG_MAP[type] || null;
  }

  getDisplayInfo(key: string): { label: string; unit: string } {
    const map: Record<string, { label: string; unit: string }> = {
      ph: { label: 'pH', unit: '' },
      nitrogen: { label: 'Nitrogen', unit: 'kg/ha' },
      phosphorous: { label: 'Phosphorus', unit: 'kg/ha' },
      potassium: { label: 'Potassium', unit: 'kg/ha' },
      soilMoisturePercentage1: { label: 'Soil Moisture Top', unit: '%' },
      soilMoisturePercentage2: { label: 'Soil Moisture Deep', unit: '%' },
      temperature: { label: 'Soil Temperature', unit: 'deg C' },
      electricalConductivity: { label: 'EC', unit: 'uS/cm' },
      rainfall: { label: 'Rainfall', unit: 'mm' },
      airTemperature: { label: 'Air Temperature', unit: 'deg C' },
      airHumidity: { label: 'Humidity', unit: '%' },
      windSpeed: { label: 'Wind Speed', unit: 'km/h' },
      airPressure: { label: 'Air Pressure', unit: 'hPa' },
      leafWetness: { label: 'Leaf Wetness', unit: '' },
      lux: { label: 'Lux', unit: 'lx' }
    };

    return map[key] || { label: key, unit: '' };
  }

  buildDailyMetricSeries(data: any): { dates: string[]; metrics: Record<string, Record<string, number>> } {
    const keyMap: Record<string, string> = {
      pH: 'ph',
      ec: 'electricalConductivity',
      soil_moisture_percentage_L1: 'soilMoisturePercentage1',
      soil_moisture_percentage_L2: 'soilMoisturePercentage2',
      temperature: 'temperature',
      nitrogen: 'nitrogen',
      phosphorous: 'phosphorous',
      potassium: 'potassium',
      humidity: 'airHumidity',
      air_temperature: 'airTemperature',
      air_temperature_c: 'airTemperature',
      air_humidity_pct: 'airHumidity',
      air_pressure_hpa: 'airPressure',
      rainfall: 'rainfall',
      rainfall_mm: 'rainfall',
      rain: 'rainfall',
      rainFall: 'rainfall',
      rain_stats: 'rainfall',
      wind_speed: 'windSpeed',
      wind_speed_ms: 'windSpeed',
      leaf_wetness: 'leafWetness',
      lux: 'lux'
    };

    const buckets: Record<string, Record<string, number[]>> = {};
    const ingest = (devices: any[]) => {
      devices.forEach(device => {
        const statsObj = device.stats || {};
        Object.keys(statsObj).forEach(date => {
          const dayStats = statsObj[date] || {};
          Object.keys(dayStats).forEach(apiKey => {
            const metricKey = keyMap[apiKey] || apiKey;
            const stat = dayStats[apiKey];
            const value = this.resolveDailyMetricValue(metricKey, stat);
            if (value == null) return;
            if (!buckets[metricKey]) buckets[metricKey] = {};
            if (!buckets[metricKey][date]) buckets[metricKey][date] = [];
            buckets[metricKey][date].push(value);
          });
        });
      });
    };

    ingest(data?.sensorDevices || []);
    ingest(data?.weatherDevices || []);

    const metrics: Record<string, Record<string, number>> = {};
    const dateSet = new Set<string>();

    Object.keys(buckets).forEach(metricKey => {
      metrics[metricKey] = {};
      Object.keys(buckets[metricKey]).forEach(date => {
        const values = buckets[metricKey][date];
        metrics[metricKey][date] = values.reduce((a, b) => a + b, 0) / values.length;
        dateSet.add(date);
      });
    });

    return {
      dates: Array.from(dateSet).sort(),
      metrics,
    };
  }

  private resolveDailyMetricValue(metricKey: string, stat: any): number | null {
    if (stat == null || stat === '') {
      return null;
    }

    if (typeof stat !== 'object') {
      return this.toFiniteNumber(stat);
    }

    const candidates = metricKey === 'rainfall'
      ? [
          stat.total,
          stat.sum,
          stat.last,
          stat.latest,
          stat.value,
          stat.mean,
          stat.avg,
          stat.average,
          stat.max,
          stat.min
        ]
      : [
          stat.mean,
          stat.avg,
          stat.average,
          stat.last,
          stat.latest,
          stat.value,
          stat.total,
          stat.sum
        ];

    for (const candidate of candidates) {
      const value = this.toFiniteNumber(candidate);
      if (value != null) {
        return value;
      }
    }

    return null;
  }

  private toFiniteNumber(value: any): number | null {
    if (value == null || value === '') {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
