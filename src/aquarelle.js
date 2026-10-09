// Lavis d'aquarelle de la roue des saisons, peints une seule fois dans un canvas (aucune image à télécharger).
// Méthode : un contour irrégulier est déformé plusieurs fois, puis superposé en couches très transparentes ;
// les bords se mêlent et se foncent comme du pigment qui sèche.

/** Générateur pseudo-aléatoire à graine : le même dessin à chaque visite. */
export function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (hasard) => Math.sqrt(-2 * Math.log(1 - hasard())) * Math.cos(2 * Math.PI * hasard());

/** Contour de départ : un disque irrégulier de `n` sommets. */
export function contour(cx, cy, rayon, n, hasard) {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const r = rayon * (0.82 + hasard() * 0.36);
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
}

/** Coupe chaque côté en deux et pousse le milieu au hasard, `profondeur` fois : le contour devient organique. */
export function deformer(points, profondeur, variance, hasard) {
  let pts = points;
  for (let d = 0; d < profondeur; d += 1) {
    const suite = [];
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const longueur = Math.hypot(b.x - a.x, b.y - a.y);
      suite.push(a, {
        x: (a.x + b.x) / 2 + gauss(hasard) * variance * longueur,
        y: (a.y + b.y) / 2 + gauss(hasard) * variance * longueur,
      });
    }
    pts = suite;
  }
  return pts;
}

// Courbe douce passant par les milieux des côtés : le contour n'a plus d'angles.
function tracer(ctx, pts) {
  const n = pts.length;
  const milieu = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const depart = milieu(pts[n - 1], pts[0]);
  ctx.beginPath();
  ctx.moveTo(depart.x, depart.y);
  for (let i = 0; i < n; i += 1) {
    const m = milieu(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  ctx.closePath();
}

function lavis(ctx, cx, cy, rayon, [r, v, b], hasard, couches, opacite) {
  const base = deformer(contour(cx, cy, rayon, 8, hasard), 3, 0.18, hasard);
  for (let c = 0; c < couches; c += 1) {
    tracer(ctx, deformer(base, 2, 0.07, hasard));
    ctx.fillStyle = `rgba(${r}, ${v}, ${b}, ${opacite})`;
    ctx.fill();
  }
}

/** Pigments, un par mois (index 0 = janvier) : bleus de l'hiver, verts du printemps, jaune à corail de l'été, ocre à brique de l'automne. */
export const PIGMENTS = [
  [122, 158, 204], [150, 164, 212], // janvier, février
  [170, 204, 120], [124, 188, 124], [96, 176, 132], // mars, avril, mai
  [240, 206, 98], [243, 172, 86], [236, 140, 108], // juin, juillet, août
  [226, 160, 84], [208, 122, 76], [178, 100, 82], // septembre, octobre, novembre
  [138, 168, 206], // décembre : le bleu revient et boucle avec janvier
];

export const SAISONS_PAR_MOIS = ["hiver", "hiver", "printemps", "printemps", "printemps", "été", "été", "été", "automne", "automne", "automne", "hiver"];

/**
 * Peint une toile par saison (printemps, été, automne, hiver) : trois lavis qui se mêlent, placés en anneau.
 * `taille` en pixels du canvas ; l'anneau est centré sur le canvas, mois 1 en haut, sens des aiguilles d'une montre.
 */
export function peindreSaisons(taille = 720) {
  const toiles = {};
  for (const saison of ["printemps", "été", "automne", "hiver"]) {
    const toile = document.createElement("canvas");
    toile.width = taille;
    toile.height = taille;
    toiles[saison] = toile;
  }
  const hasard = generateur(20261009);
  const c = taille / 2;
  // La toile déborde de la roue de 12 % de chaque côté (voir le style) : les taches ne sont jamais coupées.
  const anneau = (taille * 0.38) / 1.24;
  const rayon = (taille * 0.14) / 1.24;
  for (let mois = 1; mois <= 12; mois += 1) {
    const saison = SAISONS_PAR_MOIS[mois - 1];
    const ctx = toiles[saison].getContext("2d");
    const angle = ((mois - 1) * 30 * Math.PI) / 180;
    const x = c + Math.sin(angle) * anneau;
    const y = c - Math.cos(angle) * anneau;
    const pigment = PIGMENTS[mois - 1];
    lavis(ctx, x, y, rayon, pigment, hasard, 42, 0.021); // le fond du lavis
    // une seconde tache plus petite, décalée et un peu plus foncée : le pigment qui s'accumule
    const decalage = (hasard() - 0.5) * rayon * 0.5;
    lavis(ctx, x + decalage, y - decalage, rayon * 0.55, pigment.map((v) => Math.max(0, v - 24)), hasard, 20, 0.016);
  }
  return toiles;
}
