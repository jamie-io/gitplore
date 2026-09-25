/**
 * Models that belong to an environment rather than to a project's landmark: the Deslopify
 * jungle's Blender-authored props. They are grouped under the environment's id, so the hub's
 * `core` preload never fetches them; the jungle asks for them when it is built, and each stands
 * as its procedural proxy until it arrives.
 */
export const ENVIRONMENT_MODELS = {
  'card-frame.glb': 'jungle',
  'jungle-arch.glb': 'jungle',
  'lantern.glb': 'jungle',
  'stele.glb': 'jungle',
};
