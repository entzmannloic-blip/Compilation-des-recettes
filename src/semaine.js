// État « Ma semaine » : { [idRecette]: personnes }. Fonctions pures, le stockage est injecté
// (objet de type Web Storage avec getItem / setItem), donc utilisable dans le navigateur.

const CLE = "compilation-recettes.semaine";

/** Lit la semaine ; renvoie {} si le stockage est absent, en erreur ou illisible. */
export function chargerSemaine(storage, recettes) {
  let brut;
  try {
    brut = storage.getItem(CLE);
  } catch {
    return {};
  }
  let lu;
  try {
    lu = JSON.parse(brut);
  } catch {
    return {};
  }
  if (lu === null || typeof lu !== "object" || Array.isArray(lu)) return {};

  const ids = new Set(recettes.map((r) => r.id));
  const semaine = {};
  for (const [id, personnes] of Object.entries(lu)) {
    if (ids.has(id) && Number.isInteger(personnes) && personnes >= 1) semaine[id] = personnes;
  }
  return semaine;
}

/** Enregistre la semaine ; ne lève jamais d'erreur (stockage absent, plein ou refusé). */
export function sauverSemaine(storage, semaine) {
  try {
    storage.setItem(CLE, JSON.stringify(semaine));
  } catch {
    // Sans stockage, la semaine reste valable pour la session en cours.
  }
}

/** Ajoute la recette (avec ses personnes) ou la retire. Renvoie un nouvel objet. */
export function basculer(semaine, recette) {
  const copie = { ...semaine };
  if (Object.hasOwn(copie, recette.id)) delete copie[recette.id];
  else copie[recette.id] = recette.personnes;
  return copie;
}

/** Fixe le nombre de personnes (entier ≥ 1) d'une recette déjà dans la semaine. */
export function definirPersonnes(semaine, id, n) {
  if (!Object.hasOwn(semaine, id)) return { ...semaine };
  const personnes = Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
  return { ...semaine, [id]: personnes };
}
