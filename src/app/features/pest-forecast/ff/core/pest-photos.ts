/**
 * Reference photos for each pest or disease, shown beside the inspection plan so the farmer knows what
 * to look for. Credits are shown as plain text under each photo; the app links nowhere from here.
 */
export interface PestPhoto {
  src: string;
  caption: string;
  /** Shown under the photo as plain text; no outbound link. */
  credit: string;
}

export const PEST_PHOTOS: Record<string, PestPhoto[]> = {
  cwsb: [
    { src: 'wsb/pests/field-tunnel-holes.jpg', caption: 'Round exit holes in the bark: the clearest sign', credit: 'Field photo' },
    { src: 'wsb/pests/field-exit-hole.jpg', caption: 'A single round exit hole on a branch', credit: 'Field photo' },
    { src: 'wsb/pests/field-grub-split.jpg', caption: 'Grub in a split stem, surrounded by wood powder', credit: 'Field photo' },
    { src: 'wsb/pests/field-grubs-stem.jpg', caption: 'Several grubs and their tunnels inside a stem', credit: 'Field photo' },
    { src: 'wsb/pests/ccri-ridges.jpg', caption: 'Ridges on the stem: the earliest field sign', credit: 'Central Coffee Research Institute handbook' },
    { src: 'wsb/pests/ccri-damage.jpg', caption: 'Damage inside a split stem', credit: 'Central Coffee Research Institute handbook' },
    { src: 'wsb/pests/ccri-tunnels.jpg', caption: 'Internal tunnelling inside a bored stem', credit: 'Central Coffee Research Institute handbook' },
    { src: 'wsb/pests/ccri-surface.jpg', caption: 'Surface feeding under the bark', credit: 'Central Coffee Research Institute handbook' },
    { src: 'wsb/pests/ccri-yellowing.jpg', caption: 'Yellowing leaves on an infested bush', credit: 'Central Coffee Research Institute handbook' },
    { src: 'wsb/pests/ccri-larva.jpg', caption: 'Larva: pale yellow, legless, 2-3 cm when mature', credit: 'Central Coffee Research Institute handbook' },
    { src: 'wsb/pests/ccri-pupa.jpg', caption: 'Pupa in its chamber just below the bark', credit: 'Central Coffee Research Institute handbook' },
    { src: 'wsb/pests/ccri-eggs.jpg', caption: 'Eggs laid in bark crevices', credit: 'Central Coffee Research Institute handbook' },
    { src: 'wsb/pests/cwsb-field-1.jpg', caption: 'Adult beetle on a trunk in a Karnataka estate', credit: 'vishwanathgowda (iNaturalist) - CC0' },
    { src: 'wsb/pests/cwsb-field-2.jpg', caption: 'Adult beetle on a leaf: note the pale zig-zag bands', credit: 'subhasish_arandhara (iNaturalist) - CC BY 4.0' },
  ],
  rust: [
    { src: 'wsb/pests/rust-2.jpg', caption: 'Orange powder under the leaf: the classic rust sign', credit: 'Smartse' },
    { src: 'wsb/pests/rust-3.jpg', caption: 'Rust pustules spreading across a leaf', credit: 'Carvalho et al.' },
    { src: 'wsb/pests/rust-1.jpg', caption: 'Heavy leaf fall on a rusted bush', credit: 'Michael.C.Wright' },
  ],
  berryborer: [
    { src: 'wsb/pests/berryborer-2.jpg', caption: 'Bored berry with the tiny entry hole', credit: 'L. Shyamal' },
    { src: 'wsb/pests/berryborer-3.jpg', caption: 'Entry hole and frass at the berry tip', credit: 'L. Shyamal' },
    { src: 'wsb/pests/berryborer-1.jpg', caption: 'Entry holes on ripening berries', credit: 'Michael.C.Wright' },
  ],
  mealybug: [
    { src: 'wsb/pests/mealybug-1.jpg', caption: 'White cottony mealybug cluster', credit: 'Sinikka Halme' },
    { src: 'wsb/pests/mealybug-2.jpg', caption: 'A single mealybug, close up', credit: 'Whitney Cranshaw, Colorado State University, United States' },
  ],
  shothole: [
    { src: 'wsb/pests/shothole-1.jpg', caption: 'White boring dust on bark: the tell-tale sign', credit: 'Tim Schowalter, Oregon St. U.' },
    { src: 'wsb/pests/shothole-2.jpg', caption: 'The shot-hole (ambrosia) beetle, close up', credit: 'Michael C. Thomas, Florida Department of Agriculture and Con' },
  ],
};
