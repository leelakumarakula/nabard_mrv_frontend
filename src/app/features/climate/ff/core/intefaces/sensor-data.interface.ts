export interface Crop {
  id: string;
  name: string;
}

export interface SoilProperties {
  electricalConductivity: number;
  humidity: number;
  ph: number;
  soilMoisturePercentage1: number;
  soilMoisturePercentage2: number;
  soilMoistureValue: number;
  temperature: number;
  voltage: number;
}

export interface SoilNutrients {
  nitrogen: number;
  phosphorous: number;
  potassium: number;
}

export interface ExtraParameters {
  lux: number;
  solarRadiation: number;
}

export interface DashboardSensorData {
  tenantId: string;
  macId: string;
  lat: number;
  long: number;
  deviceName: string;
  /** Already converted to IST server-side, and carries no zone marker. */
  updateAt: string;
  /**
   * The same instant in UTC, also unmarked. This is the one to render: it can
   * be shown in whatever zone the device actually sits in.
   */
  utc_updatedat?: string;
  /** When the device was registered; readings before it do not exist. */
  installationDate?: string;
  crops: Crop[];
  soilProperties: SoilProperties;
  soilNutrients: SoilNutrients;
  extraParameters: ExtraParameters;
  addOnId: number;
  moistureThresholdValues?: {
    l1_moisture_threshold: number;
    l2_moisture_threshold: number;
  };
  moistureThresholdsResponse?: {
    isNpkDisplayed: boolean;
    displayMessage: string;
  };
}
