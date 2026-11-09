import { deviceIcon, deviceKind, deviceState, legendKey, legendLevel, markerColour } from './map-colours';

describe('IoT device markers', () => {
  it('names the icon by device type and reporting state', () => {
    expect(deviceIcon({ device_type: 'soilsync_7in1', reporting_state: 'reporting' })).toBe('dev-S-reporting');
    expect(deviceIcon({ device_type: 'microclime', reporting_state: 'silent' })).toBe('dev-W-silent');
    expect(deviceIcon({ device_type: 'unknown_type', reporting_state: 'odd' })).toBe('dev-D-none');
  });

  it('colours the states and labels the types', () => {
    expect(deviceState('late').colour).toBe('#f9a825');
    expect(deviceKind('analogue_weather').label).toBe('Analogue weather station');
  });
});

describe('rainfall colour layer', () => {
  const plot = (status: string | null) => ({ rainfall: status ? { ytd_status: status } : undefined });

  it('colours a plot by its year-to-date rainfall status', () => {
    expect(legendKey(plot('little_less'), 'rainfall')).toBe('little_less');
    expect(legendKey(plot(null), 'rainfall')).toBe('none');
    expect(markerColour(plot('very_much_less'), 'rainfall')).toBe('#c62828');
  });

  it('raises the driest plots highest and keeps "too few days measured" flat', () => {
    expect(legendLevel(plot('very_much_less'), 'rainfall')).toBe(1);
    expect(legendLevel(plot('extra'), 'rainfall')).toBeCloseTo(0.2);
    expect(legendLevel(plot('insufficient_data'), 'rainfall')).toBe(0);
    expect(legendLevel(plot(null), 'rainfall')).toBe(0);
  });
});
