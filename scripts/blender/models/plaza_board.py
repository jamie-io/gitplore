"""
The Plaza's notice board: the frame the exhibit's poster (`ScreenLandmark`) is shown in.

Only the frame, posts and roof are modelled, as `card_frame.py` does for the jungle's cards; the
game keeps drawing the face. Its contract (landmarks/base/screen.landmark.ts) is kept: a
3.2 × 2 m face centred at y = 1.9, its plane at z = 0.09, in front of a 3.4 × 2.2 m body whose
front is at z = 0.08. The project label (0.6 m tall, as wide as the title) hangs at y = 3.45,
z = 0.05, so the name board behind it stops at z = 0.03. Nothing enters the face's rectangle in
front of z = 0.08. The empty `face` marks the face's centre on its plane.

Timber posts on travertine feet at x = ±1.8, inside the landmark's collider (±1.9 × ±0.48), carry a
moulded frame, a chalk ledge under the face, the name board, and a small barrel-tiled gable.
"""

from kit import Part, material, mix, tone
from plaza_props import DOOR, TIMBER, TIMBER_DARK, gable, gable_end, marker, stone

FACE_W = 3.2
FACE_H = 2.0
FACE_Y = 1.9
FACE_Z = 0.09
BODY_FRONT = 0.08
LABEL_Y = 3.45

POST_X = 1.8
POST = 0.14
EAVE_Y = 3.98
RIDGE_Y = 4.36


def build(seed=31):
    wood = material("plaza-board", roughness=0.8)
    part = Part("board", [wood], seed=seed)
    rng = part.rng

    # Posts on stone feet, up to the eaves.
    for side in (-1, 1):
        x = side * POST_X
        part.box((0.24, 0.2, 0.3), at=(x, 0.1, 0), color=stone(rng), bevel=0.025)
        part.box((POST, EAVE_Y - 0.2, POST), at=(x, 0.2 + (EAVE_Y - 0.2) / 2, 0),
                 color=tone(DOOR, rng, 0.05))
        # Knee braces under the roof beam.
        part.box((0.07, 0.42, 0.07), at=(x - side * 0.16, EAVE_Y - 0.26, 0), rot=(0, 0, side * 0.75),
                 color=tone(TIMBER_DARK, rng))

    # The body behind the face: a board panel, and a moulded frame standing proud round the face.
    top = FACE_Y + FACE_H / 2
    bottom = FACE_Y - FACE_H / 2
    boards = 6
    width = (FACE_W + 0.2) / boards
    for i in range(boards):
        x = -(FACE_W + 0.2) / 2 + width * (i + 0.5)
        part.box((width - 0.012, FACE_H + 0.2, 0.1), at=(x, FACE_Y, BODY_FRONT - 0.05),
                 color=tone(mix(TIMBER, TIMBER_DARK, rng.random() * 0.7), rng, 0.05))
    rail = 0.1
    for y in (top + rail / 2, bottom - rail / 2):
        part.box((FACE_W + 2 * rail, rail, 0.06), at=(0, y, BODY_FRONT + 0.01), color=tone(TIMBER, rng))
    for side in (-1, 1):
        part.box((rail, FACE_H, 0.06), at=(side * (FACE_W + rail) / 2, FACE_Y, BODY_FRONT + 0.01),
                 color=tone(TIMBER, rng))
    # A chalk ledge under the face.
    part.box((FACE_W * 0.9, 0.04, 0.12), at=(0, bottom - rail - 0.02, BODY_FRONT + 0.04),
             color=tone(TIMBER_DARK, rng))
    # Rails from post to post, behind the body.
    for y in (bottom - 0.25, top + 0.12):
        part.box((2 * POST_X, 0.1, 0.07), at=(0, y, -0.02), color=tone(TIMBER_DARK, rng))

    # The name board the label hangs on.
    part.box((2 * POST_X - POST, 0.74, 0.07), at=(0, LABEL_Y, -0.005), color=tone(DOOR, rng, 0.04))
    for y in (LABEL_Y - 0.38, LABEL_Y + 0.38):
        part.box((2 * POST_X + 0.06, 0.05, 0.1), at=(0, y, 0.0), color=tone(TIMBER, rng))

    # Barrel-tiled gable.
    gable(part, -POST_X - 0.3, POST_X + 0.3, EAVE_Y, 0.52, RIDGE_Y, tiles=15, rng=rng)
    for side in (-1, 1):
        tri = [(EAVE_Y, -0.48), (EAVE_Y, 0.48), (RIDGE_Y - 0.02, 0.0)]
        gable_end(part, side * (POST_X + 0.08), tri, color=tone(TIMBER_DARK, rng))

    marker("face", (0, FACE_Y, FACE_Z))
    return [part.build()]
