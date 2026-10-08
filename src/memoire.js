// Petites listes gardées sur le téléphone : favoris, aide déjà lue.
// Fonctions pures ; le stockage est injecté (getItem / setItem), comme pour semaine.js.

export const CLES = {
  favoris: "compilation-recettes.favoris",
  aide: "compilation-recettes.aide",
  magasin: "compilation-recettes.mode-magasin",
};

/** Lit une liste de textes ; renvoie [] si le stockage est absent, en erreur ou illisible. */
export function chargerListe(storage, cle) {
  try {
    const lu = JSON.parse(storage.getItem(cle));
    return Array.isArray(lu) ? lu.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Enregistre une liste ; ne lève jamais d'erreur. */
export function sauverListe(storage, cle, liste) {
  try {
    storage.setItem(cle, JSON.stringify(liste));
  } catch {
    // Sans stockage, la liste reste valable pour la session en cours.
  }
}

/** Ajoute l'identifiant s'il n'y est pas, le retire sinon. Renvoie une nouvelle liste. */
export function basculerFavori(liste, id) {
  return liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
}
