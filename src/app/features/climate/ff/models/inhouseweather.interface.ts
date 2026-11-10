export interface InHouseWeather {
  macId?: string;
  deviceName?: string;
  isWeatherForecast?: boolean;
  /** Present on analogue responses. voltage is V, not battery percentage. */
  batteryPercentage?: number;
  batteryMillivolts?: number;
  signalStrength?: number;
  soilTemperature?: number;
  moisture1?: number;
  moisture2?: number;
  airHumidity: number;
  airPressure: number;
  airTemperature: number;
  leafWetness: number;
  rainfall: number;
  windDirection: string;
  windSpeed: number;
  voltage: number;
  updateAt: string;
  lux?: number;
}
