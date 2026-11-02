export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Ref {
  id: string;
  label: string;
}

export interface Me {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  organisation_id: string | null;
  farmer_id: string | null;
  must_change_password: boolean;
  roles: Ref[];
  role_codes: string[];
  permissions: string[];
  all_scope: boolean;
}

export interface SystemInfo {
  app_env: string;
  demo_data_present: boolean;
  api_version: string;
}

export interface Programme {
  id: string;
  code: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  funding_framework: string | null;
  funding_note: string | null;
  version_label: string | null;
  proposal_title: string | null;
  proposal_date: string | null;
  duration_months: number | null;
  is_demo: boolean;
}

export interface ReportingPeriod {
  id: string;
  programme_id: string;
  code: string;
  name: string;
  period_type: string;
  start_date: string;
  end_date: string;
  status: string;
  is_demo: boolean;
}

export interface GeoUnit {
  id: string;
  parent_id: string | null;
  unit_type: 'state' | 'district' | 'cluster';
  name: string;
  code: string;
  requires_confirmation: boolean;
  confirmation_note: string | null;
  is_demo: boolean;
  is_archived: boolean;
}

export interface GeoTreeNode extends GeoUnit {
  children: GeoTreeNode[];
  farmer_count: number;
  fpo_count: number;
}

export interface Organisation {
  id: string;
  org_type: string;
  code: string;
  name: string;
  geo_unit_id: string | null;
  geo_unit: Ref | null;
  status: string;
  is_demo: boolean;
  [key: string]: unknown;
}

export interface FieldSpec {
  name: string;
  label: string;
  type: 'number' | 'integer' | 'text' | 'textarea' | 'select' | 'date' | 'boolean';
  required: boolean;
  unit: string | null;
  options: string[] | null;
  min: number | null;
  max: number | null;
  help: string | null;
}

export interface RecordType {
  code: string;
  module_code: string;
  name: string;
  description: string;
  data_nature: string;
  data_nature_label: string;
  requires_plot: boolean;
  requires_farmer: boolean;
  requires_device: boolean;
  requires_organisation: boolean;
  supports_participants: boolean;
  requires_demonstration_site: boolean;
  supports_surveillance_cluster: boolean;
  default_activity_code: string | null;
  caution: string | null;
  fields: FieldSpec[];
}

export interface Workstream {
  code: string;
  number: number;
  name: string;
  description: string;
  record_types: RecordType[];
  record_counts: Record<string, number>;
}

export interface Indicator {
  id: string;
  code: string;
  version: number;
  name: string;
  family: string;
  module_code: string | null;
  definition: string;
  unit: string;
  method_code: string | null;
  method_reference: string | null;
  status: string;
  requires_confirmation: boolean;
  is_demo: boolean;
  [key: string]: unknown;
}

export interface Lifecycle {
  submission_status: string;
  validation_status: string;
  validation_messages: string[] | null;
  review_status: string;
  verification_status: string;
}

export interface ReviewTask {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  status: string;
  submitted_by_id: string;
  assigned_reviewer_id: string | null;
  submitted_by_name: string | null;
  reviewer_name: string | null;
  due_date: string | null;
  submission_note: string | null;
  created_at: string;
  is_demo: boolean;
}

/** Generic record shape for API rows rendered by schema-driven tables and detail grids. */
export type Row = Record<string, any>;
