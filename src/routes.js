// Lecture de l'adresse (partie après le #) : quelle page afficher.

/** « #/semaine », « #/courses », « #/livres », « #/saison » (calendrier des aliments), « #/recette/<id> », « #/cuisine/<id> » ; tout le reste mène à la saison. */
export function lireRoute(hash) {
  if (typeof hash === "string") {
    if (hash === "#/semaine") return { nom: "semaine" };
    if (hash === "#/livres") return { nom: "livres" };
    if (hash === "#/saison") return { nom: "calendrier" };
    if (hash === "#/courses") return { nom: "courses" };
    if (hash.startsWith("#/recette/") && hash.length > "#/recette/".length) {
      return { nom: "recette", id: hash.slice("#/recette/".length) };
    }
    if (hash.startsWith("#/cuisine/") && hash.length > "#/cuisine/".length) {
      return { nom: "cuisine", id: hash.slice("#/cuisine/".length) };
    }
  }
  return { nom: "saison" };
}
