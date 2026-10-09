// Calendrier des fruits et légumes : logique pure (sans écran), utilisée par l'onglet « Saison » et les fiches.

export const NOMS_MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Mois (1 à 12) de chaque saison. L'hiver enjambe la fin d'année : décembre, janvier, février. */
export const MOIS_DE_SAISON = {
  printemps: [3, 4, 5],
  été: [6, 7, 8],
  automne: [9, 10, 11],
  hiver: [12, 1, 2],
};

export function saisonDuMoisNumero(mois) {
  for (const [saison, liste] of Object.entries(MOIS_DE_SAISON)) if (liste.includes(mois)) return saison;
  return "hiver";
}

const sansAccent = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Aliments d'un mois, légumes d'abord ou fruits : type = "legume" | "fruit" (absent : les deux), triés par nom. */
export function alimentsDuMois(aliments, mois, type = null) {
  return aliments
    .filter((a) => a.mois.includes(mois) && (!type || a.type === type))
    .sort((a, b) => sansAccent(a.nom).localeCompare(sansAccent(b.nom), "fr"));
}

/**
 * Aliments d'une saison : ceux d'au moins un de ses mois. Chaque aliment garde la liste de ses mois dans la saison
 * (pour les petits points « présent en déc. · janv. · févr. »).
 */
export function alimentsDeLaSaison(aliments, saison, type = null) {
  const mois = MOIS_DE_SAISON[saison] ?? [];
  return aliments
    .filter((a) => (!type || a.type === type) && a.mois.some((m) => mois.includes(m)))
    .map((a) => ({ ...a, moisDeLaSaison: mois.filter((m) => a.mois.includes(m)) }))
    .sort((a, b) => sansAccent(a.nom).localeCompare(sansAccent(b.nom), "fr"));
}

/** Recherche d'un nom d'aliment, sans accent ni majuscule, sur toute l'année. */
export function chercherAliments(aliments, texte, type = null) {
  const t = sansAccent(texte.trim());
  if (!t) return [];
  return aliments
    .filter((a) => (!type || a.type === type) && sansAccent(a.nom).includes(t))
    .sort((a, b) => sansAccent(a.nom).localeCompare(sansAccent(b.nom), "fr"));
}

/** Découpe une liste de mois en séries consécutives (la fin d'année rejoint le début : [11, 12, 1] = une série). */
export function seriesDeMois(mois) {
  const liste = [...new Set(mois)].sort((a, b) => a - b);
  if (liste.length === 0) return [];
  if (liste.length === 12) return [{ debut: 1, fin: 12, tout: true }];
  let debut = 0;
  // On part du premier mois dont le précédent est absent, pour ne pas couper une série qui enjambe décembre.
  while (liste.includes(((liste[debut] + 10) % 12) + 1)) debut += 1;
  const series = [];
  let courante = null;
  for (let k = 0; k < liste.length; k += 1) {
    const m = liste[(debut + k) % liste.length];
    if (courante && m === (courante.fin % 12) + 1) courante.fin = m;
    else { courante = { debut: m, fin: m }; series.push(courante); }
  }
  return series;
}

/** « toute l'année », « mai – juin », « sept. – nov. » ou « déc. – févr. · juil. ». */
export function libelleMois(mois) {
  return seriesDeMois(mois)
    .map((s) => (s.tout ? "toute l'année" : s.debut === s.fin ? COURTS[s.debut - 1] : `${COURTS[s.debut - 1]} – ${COURTS[s.fin - 1]}`))
    .join(" · ");
}

/** Mois de saison de chaque ingrédient du site : identifiant → liste de mois (réunion si plusieurs aliments le mentionnent). */
export function moisParIngredient(aliments) {
  const carte = new Map();
  for (const a of aliments) {
    for (const id of a.ingredients ?? []) {
      carte.set(id, [...new Set([...(carte.get(id) ?? []), ...a.mois])].sort((x, y) => x - y));
    }
  }
  return carte;
}

/** Recettes du site qui utilisent l'aliment (au moins un de ses ingrédients). */
export function recettesAvecAliment(recettes, aliment) {
  const ids = new Set(aliment.ingredients ?? []);
  if (ids.size === 0) return [];
  return recettes.filter((r) => r.ingredients.some((l) => ids.has(l.ingredient)));
}

/** Nombre de mois à attendre avant que l'aliment soit de saison, à partir de `depuis` (0 = c'est maintenant) ; null s'il n'a aucun mois. */
export function moisAvantSaison(mois, depuis) {
  for (let k = 0; k < 12; k += 1) if (mois.includes(((depuis - 1 + k) % 12) + 1)) return k;
  return null;
}
