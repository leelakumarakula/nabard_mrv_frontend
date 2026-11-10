export type IrrigationTone = 'green' | 'amber' | 'red' | 'blue';

export interface SoilState {
  word?: string;
  tone?: IrrigationTone;
}

export interface IrrigationHeadline {
  status: string;
  color: string;
  title: string;
  message?: string;
}

export interface IrrigationToday {
  reserve_days?: number | null;
  reserve_mm?: number | null;
  moisture_pct?: number | null;
  soil_state?: SoilState;
  sensor?: { available?: boolean; agrees?: boolean; note?: string } | null;
}

export interface IrrigationDay {
  date: string;
  rain_mm: number;
  rain_held_mm?: number | null;
  rain_lost_mm?: number | null;
  water_used_mm?: number | null;
  moisture_pct: number;
  line_pct?: number | null;
  reserve_days?: number | null;
  needs_water: boolean;
  soil_state?: SoilState;
}

export interface WaterNeeded {
  depth_mm: number;
  total_m3?: number | null;
  litres_per_plant?: number | null;
}

export interface IrrigationZone {
  name: string;
  area_ha?: number | null;
  priority?: { rank: number } | null;
  headline: IrrigationHeadline;
  today: IrrigationToday;
  water_needed?: WaterNeeded | null;
}

export interface IrrigationMapBlock {
  name: string;
  title?: string;
  color?: string;
  ring: number[][];
  area_ha?: number | null;
  reserve_days?: number | null;
  soil_state?: SoilState;
}

export interface IrrigationMap {
  blocks: IrrigationMapBlock[];
  boundary?: number[][] | null;
  devices: { lat: number; lon: number; name?: string }[];
  center?: number[] | null;
}

export interface IrrigationPlan {
  /** `false` (with a `detail`) when the farm has no irrigation plan yet. */
  found?: boolean;
  detail?: string;
  farm: {
    name?: string;
    area_ha?: number | null;
    plants_total?: number | null;
    plants_per_ha?: number | null;
    plant_age_years?: number | null;
  };
  data_quality: {
    estimated?: boolean;
    soil_start?: boolean;
    updated_at?: string | null;
  };
  headline: IrrigationHeadline;
  summary?: string;
  actions?: string[];
  alerts?: { text: string }[];
  today: IrrigationToday;
  stage: { label: string };
  season?: {
    label: string;
    months?: string;
    next_starts?: string;
    next_label?: string;
  } | null;
  days: IrrigationDay[];
  water_needed?: WaterNeeded | null;
  zone_totals?: {
    blocks: number;
    blocks_needing_water: number;
    first_block?: { name: string; reason: string } | null;
  } | null;
  zones?: IrrigationZone[];
  map?: IrrigationMap | null;
  guidance?: { typical_round?: { mm?: number } } | null;
}

export interface PumpRuntime {
  hours: number;
  duration_text: string;
  flow_m3h: number;
  flow_litres_per_min: number;
  basis: string;
  warnings: string[];
}

export interface PumpRow {
  name: string;
  depth: number;
  ha: number | null | undefined;
}
