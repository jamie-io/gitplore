import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { disposeObject3D } from '@engine/dispose';
import { createLabel } from '../../landmarks/base/label';

const PLANK_MARGIN = 0.15;
const PLANK_DEPTH = 0.08;
const POST_COLOUR = 0x5a3d27;

/** Mounts a measured label on a small wooden plank sign. The group origin is ground level. */
export function createPlankSign(text: string, colour: string, postHeight = 1): Group | null {
  const label = createLabel(text, colour);
  if (!label) {
    return null;
  }

  label.geometry.computeBoundingBox();
  const bounds = label.geometry.boundingBox;
  if (!bounds) {
    disposeObject3D(label);
    return null;
  }

  const labelWidth = bounds.max.x - bounds.min.x;
  const labelHeight = bounds.max.y - bounds.min.y;
  const plankWidth = labelWidth + PLANK_MARGIN;
  const plankHeight = labelHeight + PLANK_MARGIN;
  const group = new Group();
  group.name = 'plank-sign';

  const post = new Mesh(
    new CylinderGeometry(0.035, 0.05, postHeight, 6),
    new MeshStandardMaterial({ color: POST_COLOUR, roughness: 0.85 }),
  );
  post.name = 'plank-sign-post';
  post.position.y = postHeight / 2;

  const plank = new Mesh(
    new BoxGeometry(plankWidth, plankHeight, PLANK_DEPTH),
    new MeshStandardMaterial({ color: POST_COLOUR, roughness: 0.85 }),
  );
  plank.name = 'plank-sign-plank';
  plank.position.y = postHeight + plankHeight / 2;

  label.name = 'plank-sign-label';
  label.scale.setScalar(1);
  label.position.set(0, postHeight + plankHeight / 2, PLANK_DEPTH / 2 + 0.002);

  group.add(post, plank, label);
  return group;
}
