// Lecture de l'adresse (partie après le #) : quelle page afficher.

/** « #/semaine », « #/livres », « #/recette/<id> » ; tout le reste mène à la saison. */
export function lireRoute(hash) {
  if (typeof hash === "string") {
    if (hash === "#/semaine") return { nom: "semaine" };
    if (hash === "#/livres") return { nom: "livres" };
    if (hash.startsWith("#/recette/") && hash.length > "#/recette/".length) {
      return { nom: "recette", id: hash.slice("#/recette/".length) };
    }
  }
  return { nom: "saison" };
}
