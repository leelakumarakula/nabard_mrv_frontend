import { Pipe, PipeTransform } from '@angular/core';

import { farmTimeZone, parseUtcTimestamp } from '../../utils/farm-timezone';

/** The two shapes the dashboard renders timestamps in. */
export type DeviceTimeFormat = 'medium' | 'dmy' | 'friendly';

/**
 * Renders a device's UTC timestamp in that device's own local time, with the
 * zone abbreviation appended.
 *
 * The API sends both `updateAt` (already converted to IST, unmarked) and
 * `utc_updatedat` (the true instant, also unmarked). The dashboard rendered
 * `updateAt` through the date pipe and appended a hardcoded "IST", so an
 * Indonesian device read as Indian time — and would have read Jakarta time
 * still labelled "IST" the moment the viewer's laptop moved. Feed this
 * `utc_updatedat` and the device's coordinates instead.
 *
 * `Intl.DateTimeFormat` does the conversion because Angular's `DatePipe`
 * accepts only UTC offsets, not IANA names.
 */
@Pipe({ name: 'deviceTime', standalone: true })
export class DeviceTimePipe implements PipeTransform {
  transform(
    utcValue: string | number | Date | null | undefined,
    latitude?: number | null,
    longitude?: number | null,
    format: DeviceTimeFormat = 'medium',
  ): string {
    const date = parseUtcTimestamp(utcValue);
    if (!date) {
      return '';
    }
    const zone = farmTimeZone(latitude, longitude);

    if (format === 'friendly') {
      // "Today, 6:25 AM", "Yesterday, 6:25 PM", "8 Oct, 6:25 AM" on the farm's own clock, no zone letters.
      const dayKey = (d: Date): string =>
        new Intl.DateTimeFormat('en-CA', { timeZone: zone.zone }).format(d);
      const time = new Intl.DateTimeFormat('en-US', {
        timeZone: zone.zone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(date);
      const now = new Date();
      if (dayKey(date) === dayKey(now)) return `Today, ${time}`;
      if (dayKey(date) === dayKey(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${time}`;
      const day = new Intl.DateTimeFormat('en-GB', { timeZone: zone.zone, day: 'numeric', month: 'short' }).format(date);
      return `${day}, ${time}`;
    }

    if (format === 'dmy') {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone.zone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).formatToParts(date);
      const part = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((entry) => entry.type === type)?.value ?? '';
      return (
        `${part('day')}/${part('month')}/${part('year')} ` +
        `${part('hour')}:${part('minute')}:${part('second')} ` +
        `${part('dayPeriod').toUpperCase()} ${zone.label}`
      );
    }

    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: zone.zone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
    return `${formatted} ${zone.label}`;
  }
}
