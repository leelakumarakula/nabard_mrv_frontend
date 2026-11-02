import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { RecordType } from '../core/models';
import { DemoBadge, LifecycleBadges, NatureBadge, StatusBadge } from './badges';
import { DetailGrid } from './detail-grid';
import { fromRecord, recordFields, toRecordPayload } from './record-form';

const conservation: RecordType = {
  code: 'conservation_activity', module_code: 'water', name: 'Soil & water conservation activity', description: '',
  data_nature: 'observed', data_nature_label: 'Observed', requires_plot: true, requires_farmer: true, requires_device: false,
  requires_organisation: false, supports_participants: false, requires_demonstration_site: false,
  supports_surveillance_cluster: false, default_activity_code: 'SOIL_WATER_CONSERVATION', caution: null,
  fields: [
    { name: 'practice_type', label: 'Practice', type: 'select', required: true, unit: null, options: ['mulching'], min: null, max: null, help: null },
    { name: 'area_covered_ha', label: 'Area', type: 'number', required: false, unit: 'ha', options: null, min: 0, max: 100, help: null },
  ],
};

describe('record form mapping', () => {
  it('builds location, timing and attribute fields from the record type', () => {
    const names = recordFields(conservation).map((f) => f.name);
    expect(names).toEqual(['farm_plot_id', 'observed_at', 'title', 'attr__practice_type', 'attr__area_covered_ha', 'notes']);
    const prediction = { ...conservation, data_nature: 'model_prediction', requires_plot: false };
    const predictionNames = recordFields(prediction).map((f) => f.name);
    expect(predictionNames).toContain('geo_unit_id');
    expect(predictionNames).not.toContain('observed_at');
    const visit = { ...conservation, requires_plot: false, requires_demonstration_site: true };
    expect(recordFields(visit)[0].lookup).toBe('demo_site');
    expect(recordFields(conservation, true).map((f) => f.name)).not.toContain('farm_plot_id');
  });

  it('round-trips attributes between the API shape and the form', () => {
    const payload = toRecordPayload({ farm_plot_id: 'p1', attr__practice_type: 'mulching', attr__area_covered_ha: null, notes: null });
    expect(payload).toEqual({ farm_plot_id: 'p1', notes: null, attributes: { practice_type: 'mulching' } });
    const value = fromRecord({ id: 'r1', observed_at: '2026-10-01T00:00:00Z', attributes: { practice_type: 'mulching' } });
    expect(value['attr__practice_type']).toBe('mulching');
  });
});

@Component({
  imports: [StatusBadge, DemoBadge, NatureBadge, LifecycleBadges],
  template: `<app-status [status]="status()" /><app-demo [show]="demo()" /><app-nature nature="model_prediction" />
             <app-lifecycle [row]="row" />`,
})
class Host {
  status = signal('correction_requested');
  demo = signal(true);
  row = { submission_status: 'submitted', validation_status: 'valid', review_status: 'pending_review', verification_status: 'unverified' };
}

describe('badges', () => {
  it('render status tone, DEMO label, prediction warning and separate lifecycle dimensions', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const status = el.querySelector('app-status .badge')!;
    expect(status.textContent).toContain('Correction requested');
    expect(status.className).toContain('tone-warning');
    expect(el.querySelector('app-demo')!.textContent).toContain('DEMO');
    expect(el.querySelector('app-nature')!.textContent).toContain('Prediction – not confirmed');
    const lifecycle = el.querySelectorAll('app-lifecycle app-status');
    expect(lifecycle.length).toBe(4);
    expect(el.querySelector('app-lifecycle')!.textContent).toContain('Verification:');

    fixture.componentInstance.demo.set(false);
    await fixture.whenStable();
    expect(el.querySelector('app-demo')!.textContent!.trim()).toBe('');
  });
});

describe('detail grid', () => {
  it('shows empty JSON values as a dash instead of {}', () => {
    const grid = TestBed.runInInjectionContext(() => new DetailGrid());
    expect(grid.json({})).toBe('—');
    expect(grid.json([])).toBe('—');
    expect(grid.json(null)).toBe('—');
    expect(grid.json({ land_tenure: 'owned' })).toContain('land_tenure');
  });
});
