// Génère les icônes de l'application (carré orange brique + disque blanc centré).
// Aucune dépendance : PNG écrit à la main avec le module zlib de Node.
import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TAILLES = [180, 192, 512];
const FOND = [0xc4, 0x50, 0x1f];   // --accent (orange brique)
const DISQUE = [0xff, 0xff, 0xff]; // --page (blanc)

const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const o of buf) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function morceau(type, donnees) {
  const t = Buffer.from(type, 'latin1');
  const len = Buffer.alloc(4); len.writeUInt32BE(donnees.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, donnees])));
  return Buffer.concat([len, t, donnees, crc]);
}

export function creerPng(taille) {
  const centre = taille / 2;
  const rayon = taille * 0.34;
  const ligne = 1 + taille * 3;
  const brut = Buffer.alloc(ligne * taille); // octet de filtre 0 au début de chaque ligne
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const d = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      const part = Math.min(1, Math.max(0, rayon - d + 0.5)); // bord adouci
      const o = y * ligne + 1 + x * 3;
      for (let i = 0; i < 3; i++) brut[o + i] = Math.round(FOND[i] + (DISQUE[i] - FOND[i]) * part);
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(taille, 0);
  entete.writeUInt32BE(taille, 4);
  entete[8] = 8; entete[9] = 2; // 8 bits, RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', entete),
    morceau('IDAT', deflateSync(brut)),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

export async function genererIcones(dossier) {
  await mkdir(dossier, { recursive: true });
  for (const t of TAILLES) await writeFile(join(dossier, `icon-${t}.png`), creerPng(t));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
  await genererIcones(racine);
  console.log(`Icônes écrites dans ${racine}`);
}
