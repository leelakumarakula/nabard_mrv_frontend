import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ApiService } from '../../core/api.service';
import { farmerFields, fromFarmer, toFarmerPayload } from './farmers';

describe('farmer demographics mapping', () => {
  it('collects configured demographic fields into the demographics object and back', () => {
    const payload = toFarmerPayload({ full_name: 'A', demographic__land_tenure: 'leased', demographic__community_name: null });
    expect(payload).toEqual({ full_name: 'A', demographics: { land_tenure: 'leased', community_name: null } });
    expect(toFarmerPayload({ full_name: 'A' })).toEqual({ full_name: 'A' });
    const value = fromFarmer({ id: 'f1', demographics: { land_tenure: 'owned' } });
    expect(value['demographic__land_tenure']).toBe('owned');
  });

  it('shows sensitive demographic fields only to permitted roles', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(ApiService);
    const http = TestBed.inject(HttpTestingController);
    const defs = [
      { code: 'land_tenure', label: 'Land tenure', field_type: 'select', options: ['owned'], is_sensitive: false, status: 'approved' },
      { code: 'community_name', label: 'Community', field_type: 'text', is_sensitive: true, status: 'proposed', requires_consent: true },
    ];
    const restricted = farmerFields(api, false);
    http.expectOne((r) => r.url.endsWith('/demographic-fields')).flush(defs);
    const names = (await restricted).map((f) => f.name);
    expect(names).toContain('demographic__land_tenure');
    expect(names).not.toContain('demographic__community_name');

    const permitted = farmerFields(api, true);
    http.expectOne((r) => r.url.endsWith('/demographic-fields')).flush(defs);
    const community = (await permitted).find((f) => f.name === 'demographic__community_name');
    expect(community?.label).toContain('(sensitive)');
    expect(community?.label).toContain('proposed field');
  });
});
