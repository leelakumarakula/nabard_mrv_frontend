// Copied from FarmFuture agricentral-web user/pages/dashboard/farm-today/coffee-profile.util.ts (STAGE_NAMES,
// ARABICA_STAGE_NAMES, ROBUSTA_STAGE_NAMES, coffeeStage().short) – the Season picker labels. Keep identical.
const STAGE_NAMES = {
  budDevelopment: 'Flower Bud Development and Dormancy',
  flowering: 'Flowering / Blossom',
  fruitSet: 'Fruit Set / Pinhead Stage',
  berryExpansion: 'Berry Expansion',
  beanFilling: 'Bean Development and Filling',
  ripening: 'Fruit Maturation and Ripening',
  harvesting: 'Harvesting',
  postHarvest: 'Post-Harvest Recovery and Renewal',
} as const;

const ARABICA: Record<number, string> = {
  1: STAGE_NAMES.harvesting, 2: STAGE_NAMES.postHarvest, 3: STAGE_NAMES.flowering, 4: STAGE_NAMES.fruitSet,
  5: STAGE_NAMES.berryExpansion, 6: STAGE_NAMES.berryExpansion, 7: STAGE_NAMES.berryExpansion, 8: STAGE_NAMES.beanFilling,
  9: STAGE_NAMES.beanFilling, 10: STAGE_NAMES.ripening, 11: STAGE_NAMES.ripening, 12: STAGE_NAMES.harvesting,
};
const ROBUSTA: Record<number, string> = {
  1: STAGE_NAMES.harvesting, 2: STAGE_NAMES.flowering, 3: STAGE_NAMES.fruitSet, 4: STAGE_NAMES.berryExpansion,
  5: STAGE_NAMES.berryExpansion, 6: STAGE_NAMES.berryExpansion, 7: STAGE_NAMES.berryExpansion, 8: STAGE_NAMES.berryExpansion,
  9: STAGE_NAMES.berryExpansion, 10: STAGE_NAMES.beanFilling, 11: STAGE_NAMES.ripening, 12: STAGE_NAMES.harvesting,
};
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'arabica' | 'robusta' | null (both or not known) from crop text – FarmFuture's plantedSpecies. */
export function varietyOf(crops: string): 'arabica' | 'robusta' | null {
  const a = /arabica/i.test(crops), r = /robusta/i.test(crops);
  return a && !r ? 'arabica' : r && !a ? 'robusta' : null;
}

/** The crop-stage name of a month, as the FarmFuture Season picker shows it. */
export function stageName(month: number, variety: 'arabica' | 'robusta' | null): string {
  return (variety === 'robusta' ? ROBUSTA : ARABICA)[month] ?? ARABICA[1];
}
