/**
 * The `gltf-transform optimize` options every source model is compressed with
 * (`npm run assets:optimize`): meshopt geometry, WebP textures capped at 1024 px.
 */
export const OPTIMIZE_FLAGS = [
  '--compress',
  'meshopt',
  '--texture-compress',
  'webp',
  '--texture-size',
  '1024',
  // The game finds parts by node and material name (the lantern's body and glass, the arch's
  // glow), so named nodes stay apart and materials are not merged into a palette. The models
  // are authored low-poly; simplifying would only chip at their silhouettes and colour seams.
  '--join-named',
  'false',
  '--palette',
  'false',
  '--simplify',
  'false',
  // Empty nodes mark where the game draws or places something itself (the Plaza terminal's
  // `screen`, the notice board's `face`, the feed wall's card slots, the easel's screen anchor),
  // so they must survive: pruning, flattening and joining would each
  // drop them as unused leaves. The models are exported flat and clean from Blender, so none of
  // the three changes anything else (every model before these options compressed byte-identical).
  '--prune',
  'false',
  '--flatten',
  'false',
  '--join',
  'false',
];
