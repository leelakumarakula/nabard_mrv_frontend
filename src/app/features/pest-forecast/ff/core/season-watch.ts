import { EXPOSURE_TOPICS } from '../models/cwsb-model';

/** One pest, disease or stress topic and where it stands in the estate calendar this month. */
export interface SeasonWatch {
  /** Topic key used by the field map's exposure layer (`exposure:<topic>`). */
  topic: string;
  title: string;
  phaseLabel: string;
  message: string;
  /** True when this month falls inside one of the topic's active phases. */
  inSeason: boolean;
}

interface TopicDefinition {
  title: string;
  phase: (month: number) => { key: string; label: string; message: string };
}

/**
 * The topics worth watching in a given month (1–12), most relevant first: those inside an active
 * phase of their calendar, in the order the model defines them, followed by the rest.
 */
export function seasonWatch(month: number): SeasonWatch[] {
  const rows = Object.entries(EXPOSURE_TOPICS as Record<string, TopicDefinition>).map(([topic, def]) => {
    const phase = def.phase(month);
    const offSeason = def.phase(0);
    return { topic, title: def.title, phaseLabel: phase.label, message: phase.message, inSeason: phase.key !== offSeason.key };
  });
  return [...rows.filter((r) => r.inSeason), ...rows.filter((r) => !r.inSeason)];
}

/** Month number (1–12) in Indian Standard Time. */
export function monthIST(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', month: 'numeric' }).format(now));
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The growing season a month (1–12) falls in, as farmers in the coffee belt name them. */
export function seasonName(month: number): string {
  if (month >= 3 && month <= 5) return 'Pre-monsoon';
  if (month >= 6 && month <= 9) return 'Monsoon';
  if (month === 10 || month === 11) return 'Post-monsoon';
  return 'Winter';
}

/** The pest and disease topics here are all coffee's; true when the crop text names coffee (or a coffee variety). */
export function hasPestTopics(crops: string): boolean {
  return /coffee|arabica|robusta/i.test(crops);
}
