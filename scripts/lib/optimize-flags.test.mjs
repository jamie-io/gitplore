import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { OPTIMIZE_FLAGS } from './optimize-flags.mjs';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('../../node_modules/.bin/gltf-transform', import.meta.url));

/** A model like the Plaza terminal: one named mesh node and one empty marking a runtime surface. */
function terminalLike() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const mesh = doc
    .createMesh('terminal')
    .addPrimitive(doc.createPrimitive().setAttribute('POSITION', position));
  const frame = doc.createNode('terminal').setMesh(mesh);
  const screen = doc.createNode('screen').setTranslation([0, 2.95, 0.155]);
  doc.createScene().addChild(frame).addChild(screen);
  return doc;
}

test('the optimiser keeps an empty node that marks where the game draws a surface', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'optimize-flags-'));
  try {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    await io.write(join(dir, 'in.glb'), terminalLike());
    await run(CLI, ['optimize', join(dir, 'in.glb'), join(dir, 'out.glb'), ...OPTIMIZE_FLAGS]);

    await MeshoptDecoder.ready;
    const out = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
      .read(join(dir, 'out.glb'));
    const nodes = new Map(
      out
        .getRoot()
        .listNodes()
        .map((node) => [node.getName(), node]),
    );

    assert.ok(nodes.has('terminal'), 'the mesh node keeps its name');
    assert.ok(nodes.has('screen'), 'the empty survives the optimiser');
    assert.deepEqual(
      nodes
        .get('screen')
        .getTranslation()
        .map((v) => Math.round(v * 1000) / 1000),
      [0, 2.95, 0.155],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('named nodes stay apart, materials are not merged, and nothing is simplified', () => {
  const flag = (name) => OPTIMIZE_FLAGS[OPTIMIZE_FLAGS.indexOf(name) + 1];

  assert.equal(flag('--compress'), 'meshopt');
  assert.equal(flag('--join-named'), 'false');
  assert.equal(flag('--palette'), 'false');
  assert.equal(flag('--simplify'), 'false');
});
