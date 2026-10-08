// Petites listes gardées sur le téléphone : favoris, recettes vues récemment, aide déjà lue.
// Fonctions pures ; le stockage est injecté (getItem / setItem), comme pour semaine.js.

export const CLES = {
  favoris: "compilation-recettes.favoris",
  recents: "compilation-recettes.recents",
  aide: "compilation-recettes.aide",
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

/** Met l'identifiant en tête de la liste (sans doublon) et garde les `max` plus récents. */
export function ajouterRecent(liste, id, max = 8) {
  return [id, ...liste.filter((x) => x !== id)].slice(0, max);
}

/** Ajoute l'identifiant s'il n'y est pas, le retire sinon. Renvoie une nouvelle liste. */
export function basculerFavori(liste, id) {
  return liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id];
}
