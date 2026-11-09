import { deviceId, isUnitField, observedLabel, sensorName, toneOf } from './format';

describe('formatting helpers', () => {
  it('shows daily values (stamped at noon India time) as a date only and readings with their time', () => {
    expect(observedLabel('2026-11-05T12:00:00+05:30')).not.toContain(':');  // date only
    expect(observedLabel('2026-11-05T06:30:00Z')).not.toContain(':');  // 06:30 UTC is noon in India
    expect(observedLabel('2026-11-05T12:00:00Z')).toContain(':');  // noon UTC is 17:30 in India – a real time
    expect(observedLabel('2026-11-06T14:25:49+05:30')).toMatch(/2:25|14:25/);
    expect(observedLabel(null)).toBe('—');
  });

  it('keeps units as recorded and colours source freshness', () => {
    expect(isUnitField('unit') && isUnitField('volume_unit') && !isUnitField('units_note')).toBe(true);
    expect([toneOf('ok'), toneOf('stale'), toneOf('failed'), toneOf('manual')]).toEqual(['success', 'warning', 'danger', 'info']);
  });

  it('names sensor readings as FarmFuture does and devices by MAC ID', () => {
    expect([sensorName('soil_moisture', 'L1'), sensorName('soil_moisture', 'L2'), sensorName('soil_moisture')])
      .toEqual(['Top Moisture', 'Bottom Moisture', 'Soil Moisture']);
    expect([sensorName('nitrogen'), sensorName('ph'), sensorName('light_intensity'), sensorName('new_thing')])
      .toEqual(['Nitrogen', 'pH', 'Lux', 'New thing']);
    expect([deviceId('FF-A0B76527FAEC'), deviceId('SS-001')]).toEqual(['A0B76527FAEC', 'SS-001']);
  });
});
