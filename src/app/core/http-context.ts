import { HttpContextToken } from '@angular/common/http';

/** Set on a request to handle errors in the calling component instead of the global toast. */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);
