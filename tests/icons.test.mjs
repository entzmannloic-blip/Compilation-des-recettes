import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { genererIcones, TAILLES } from '../scripts/make-icons.mjs';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pixel(png, x, y) {
  const largeur = png.readUInt32BE(16);
  const brut = inflateSync(Buffer.concat(idat(png)));
  const ligne = 1 + largeur * 3;
  const o = y * ligne + 1 + x * 3;
  return [brut[o], brut[o + 1], brut[o + 2]];
}
function idat(png) {
  const morceaux = [];
  let pos = 8;
  while (pos < png.length) {
    const len = png.readUInt32BE(pos);
    const type = png.toString('latin1', pos + 4, pos + 8);
    if (type === 'IDAT') morceaux.push(png.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  return morceaux;
}

test('les trois icônes sont de vrais PNG aux bonnes largeurs', async () => {
  const dossier = await mkdtemp(join(tmpdir(), 'icones-'));
  try {
    await genererIcones(dossier);
    const attendu = { 'icon-180.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
    assert.deepEqual([...TAILLES].sort(), [180, 192, 512]);
    for (const [nom, largeur] of Object.entries(attendu)) {
      const png = await readFile(join(dossier, nom));
      assert.deepEqual(png.subarray(0, 8), SIGNATURE, `${nom} : signature`);
      assert.equal(png.readUInt32BE(16), largeur, `${nom} : largeur`);
      assert.equal(png.readUInt32BE(20), largeur, `${nom} : hauteur`);
    }
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
});

test('fond vert herbe avec un disque clair au centre', async () => {
  const dossier = await mkdtemp(join(tmpdir(), 'icones-'));
  try {
    await genererIcones(dossier);
    const png = await readFile(join(dossier, 'icon-192.png'));
    assert.deepEqual(pixel(png, 0, 0), [0x4d, 0x7c, 0x0f]);
    assert.deepEqual(pixel(png, 96, 96), [0xf2, 0xf4, 0xef]);
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
});
