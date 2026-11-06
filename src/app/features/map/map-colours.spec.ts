import { legendKey, legendLevel, markerColour } from './map-colours';

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
