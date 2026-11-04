import { COLOUR_MODES, legendKey, markerColour } from './plot-map';

describe('farm map colours', () => {
  const plot = {
    practice_stage: 'observed',
    pest_risk: { risk_level: 'very_high' },
    ndvi: { index_value: 0.45 },
    forecast: { rainfall_mm: 64.5 },
  };

  it('puts each plot in the right legend bucket', () => {
    expect(legendKey(plot, 'practice')).toBe('observed');
    expect(legendKey(plot, 'pest')).toBe('very_high');
    expect(legendKey(plot, 'climate')).toBe('none');
    expect(legendKey(plot, 'ndvi')).toBe('moderate');
    expect(legendKey(plot, 'rain')).toBe('r50');
    expect(legendKey({ ndvi: { index_value: 0 } }, 'ndvi')).toBe('bare');
  });

  it('uses grey for plots without data and a legend colour otherwise', () => {
    for (const mode of COLOUR_MODES) {
      expect(markerColour({}, mode.value)).toBe('#9e9e9e');
      const keys = mode.legend.map((l) => l.colour);
      expect(keys).toContain(markerColour(plot, mode.value));
    }
  });
});
