// Data contract for `GET /api/FarmProfile/{farmId}` (agricentral-api). Richer
// than the pipeline Trace: it carries terrain/soil/climate summaries, per-zone
// profiles, the stored terrain points and zone polygons used to render the 3D
// farm view, and the farm's devices. The 3D component normalises this into the
// renderer's `Trace` shape and uses the summaries for the side panel.

export interface FarmProfileTerrainPoint {
  lat: number;
  lon: number;
  elevation_m: number;
  slope_deg: number;
  tpi_zone: string;
  aspect?: string;
}

export interface FarmProfileDevice {
  name: string;
  label?: string;
  lat: number;
  lon: number;
}

export interface FarmProfileSummaryTerrain {
  elevation_mean_m: number;
  elevation_min_m: number;
  elevation_max_m: number;
  elevation_range_m: number;
  slope_class: string;
  slope_mean_deg: number;
  slope_max_deg?: number;
  steep_cell_pct: number | null;
  aspect: string;
  drainage?: string;
  frost_risk?: string;
  cells: number;
}

export interface FarmProfileSummarySoil {
  ph: number;
  texture: string;
  clay: number;
  sand: number;
  silt: number;
  oc_pct: number;
  bulk_density: number;
  field_capacity: number;
  whc_class: string;
  whc_mm_per_m: number;
}

export interface FarmProfileDrySpell {
  longest_days: number;
  longest_year?: number | string | null;
  mean_max_days?: number | null;
  mean_dry_days?: number | null;
}

export interface FarmProfileSummaryClimate {
  period: string;
  total_years: number;
  annual_rainfall_mm: number;
  rainfall_cv_pct?: number | null;
  sw_monsoon_pct?: number | null;
  mean_temp_c: number;
  tmin_c?: number | null;
  tmax_c?: number | null;
  dry_spell?: FarmProfileDrySpell;
}

export interface FarmProfileSummary {
  terrain: FarmProfileSummaryTerrain;
  soil: FarmProfileSummarySoil;
  climate: FarmProfileSummaryClimate;
}

export interface FarmProfileZoneTerrain {
  elevation_min_m: number;
  elevation_max_m: number;
  slope_class: string;
  slope_mean_deg: number;
  aspect: string;
  drainage?: string;
  cells: number;
}

export interface FarmProfileZoneSoil {
  ph: number;
  texture: string;
  oc_pct: number;
  whc_class: string;
}

export interface FarmProfileZone {
  terrain: FarmProfileZoneTerrain;
  soil: FarmProfileZoneSoil;
}

export interface FarmProfile {
  name?: string;
  built_at?: string;
  devices?: FarmProfileDevice[];
  zone_profiles?: FarmProfileZone[];
  terrain_points?: FarmProfileTerrainPoint[];
  /** Zone polygons; each polygon is an array of [lon, lat] pairs. */
  zones?: [number, number][][];
  summary?: FarmProfileSummary;
}
