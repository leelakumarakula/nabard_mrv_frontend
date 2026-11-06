import { settingFields } from './integrations';

describe('connector settings in the source edit form', () => {
  const defaults = { past_days: 3, series: 'app', include_lab_reports: true, units: { leaf_wetness: 'raw' }, programme_code: 'X' };

  it('turns each setting into a typed field and never offers the programme code twice', () => {
    const fields = settingFields(defaults, { programme_code: 'TEST-FF', old_flag: 'x' }, 'farmfuture_soil_microclimate');
    const byKey = Object.fromEntries(fields.map((f) => [f.name.replace('setting__', ''), f]));
    expect(Object.keys(byKey)).toEqual(['past_days', 'series', 'include_lab_reports', 'units', 'old_flag']);
    expect(byKey['past_days'].type).toBe('integer');
    expect([byKey['past_days'].min, byKey['past_days'].max]).toEqual([1, 31]);
    expect(byKey['series'].type).toBe('select');
    expect((byKey['series'].options ?? []).map((o) => (o as { value: string }).value)).toEqual(['app', 'raw', 'calibrated', 'lab_anchored']);
    expect(byKey['include_lab_reports'].type).toBe('boolean');
    expect(byKey['units'].type).toBe('json');
    expect(byKey['old_flag'].label).toBe('Old flag');
  });

  it('shows the settings only while the adapter is unchanged', () => {
    const [field] = settingFields({ past_days: 3 }, {}, 'farmfuture_weather');
    expect(field.showIf?.({ adapter_code: 'farmfuture_weather' })).toBe(true);
    expect(field.showIf?.({ adapter_code: 'open_meteo_weather' })).toBe(false);
  });
});
