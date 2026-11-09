import pestsDiseases from '../data/pests_diseases.json';

/** The fields of an entry in data/pests_diseases.json that the UI reads. */
export interface PestGuidance {
  id: string;
  type: string;
  name: string;
  scientific_name: string;
  symptoms: string[];
  immediate_actions: string[];
  followup_days: number;
}

/**
 * Inspection-plan topic -> guidance id. Only topics with an entry in the content file are listed;
 * the others (shot-hole borer, mealybugs, heat, canopy) simply show no guidance panel.
 */
const TOPIC_TO_GUIDANCE: Record<string, string> = {
  cwsb: 'cwsb',
  rust: 'leaf_rust',
  blackrot: 'black_rot',
  berryborer: 'berry_borer',
  root: 'root_rot',
};

const ITEMS = pestsDiseases.items as PestGuidance[];

export function guidanceForTopic(topic: string): PestGuidance | null {
  const id = TOPIC_TO_GUIDANCE[topic];
  return (id && ITEMS.find((item) => item.id === id)) || null;
}
