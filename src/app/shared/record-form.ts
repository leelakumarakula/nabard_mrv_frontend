import { RecordType, Row } from '../core/models';
import { FieldDef } from './form-dialog';

const ATTR = 'attr__';

/** Form fields for a workstream record type: location/links first, then the record type's own attributes. */
export function recordFields(rt: RecordType, editing = false): FieldDef[] {
  const fields: FieldDef[] = [];
  if (!editing) {
    if (rt.requires_demonstration_site) {
      fields.push({ name: 'demonstration_site_id', label: 'Demonstration site', type: 'lookup', lookup: 'demo_site', required: true });
    } else if (rt.requires_device) {
      fields.push({ name: 'device_id', label: 'Device', type: 'lookup', lookup: 'device', required: true });
    } else if (rt.requires_plot) {
      fields.push({ name: 'farm_plot_id', label: 'Plot', type: 'plot', required: true });
    } else if (rt.requires_organisation) {
      fields.push({ name: 'organisation_id', label: 'FPO / grower group', type: 'lookup', lookup: 'fpo', required: true });
    } else {
      fields.push({ name: 'geo_unit_id', label: 'Geography', type: 'lookup', lookup: 'geo', required: true });
    }
    if (rt.supports_surveillance_cluster) {
      fields.push({ name: 'surveillance_cluster_id', label: 'Pest surveillance cluster', type: 'lookup', lookup: 'surveillance_cluster',
        hint: 'Link inspections made as part of a surveillance cluster' });
    }
  }
  if (rt.data_nature !== 'model_prediction') {
    fields.push({ name: 'observed_at', label: 'Observed / activity date-time', type: 'datetime', required: true });
  }
  fields.push({ name: 'title', label: 'Title (optional)', type: 'text' });
  for (const f of rt.fields) {
    fields.push({
      name: ATTR + f.name, label: f.label, required: f.required, unit: f.unit, hint: f.help ?? undefined,
      min: f.min, max: f.max, options: f.options ?? undefined,
      type: f.type === 'integer' ? 'integer' : f.type === 'number' ? 'number' : f.type,
    });
  }
  fields.push({ name: 'notes', label: 'Notes', type: 'textarea' });
  return fields;
}

/** Split the flat form value into API fields and the attributes object. */
export function toRecordPayload(value: Row): Row {
  const payload: Row = { attributes: {} };
  for (const [key, v] of Object.entries(value)) {
    if (key.startsWith(ATTR)) {
      if (v !== null) payload['attributes'][key.slice(ATTR.length)] = v;
    } else {
      payload[key] = v;
    }
  }
  return payload;
}

/** Existing record → form value (attributes flattened, timestamps for datetime-local handled by the dialog). */
export function fromRecord(record: Row): Row {
  const value: Row = { ...record, observed_at: record['observed_at'] };
  for (const [key, v] of Object.entries(record['attributes'] ?? {})) value[ATTR + key] = v;
  return value;
}

