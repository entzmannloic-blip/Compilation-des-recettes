// Logique pure de l'application : aucune dépendance, aucun effet de bord.
import { SAISONS } from "./schema.js";

/** Minuscules, sans accents, « œ » → « oe », « æ » → « ae », espaces coupés. */
export function normaliser(texte) {
  return texte
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Saison d'une date : mars-mai printemps, juin-août été, sept.-nov. automne, déc.-fév. hiver. */
export function saisonDuMois(date) {
  const mois = date.getMonth(); // 0 = janvier
  if (mois >= 2 && mois <= 4) return "printemps";
  if (mois >= 5 && mois <= 7) return "été";
  if (mois >= 8 && mois <= 10) return "automne";
  return "hiver";
}

/**
 * Saisons communes à tous les ingrédients qui ont des saisons.
 * Toutes les saisons si aucun ingrédient n'est saisonnier ; [] si aucune saison commune.
 */
export function saisonsDeduites(recette, ingredients) {
  const parId = new Map(ingredients.map((i) => [i.id, i]));
  const listes = recette.ingredients
    .map((ligne) => parId.get(ligne.ingredient))
    .filter((ing) => ing && ing.saisons.length > 0)
    .map((ing) => ing.saisons);
  return SAISONS.filter((saison) => listes.every((liste) => liste.includes(saison)));
}

/** Filtres combinés en « et », résultat trié par titre. */
export function filtrerRecettes(recettes, ingredients, { saison, categorie, type, recherche } = {}) {
  const nomsParId = new Map(ingredients.map((i) => [i.id, normaliser(i.nom)]));
  const motif = recherche ? normaliser(recherche) : "";
  return recettes
    .filter((r) => !saison || r.saisons.includes(saison))
    .filter((r) => !categorie || r.categorie === categorie)
    .filter((r) => !type || r.type === type)
    .filter((r) => {
      if (!motif) return true;
      if (normaliser(r.titre).includes(motif)) return true;
      return r.ingredients.some((ligne) => (nomsParId.get(ligne.ingredient) ?? "").includes(motif));
    })
    .sort((a, b) => normaliser(a.titre).localeCompare(normaliser(b.titre), "fr"));
}

/** Types de recettes présents, sans doublon, triés. */
export function typesDisponibles(recettes) {
  return [...new Set(recettes.map((r) => r.type))].sort((a, b) => a.localeCompare(b, "fr"));
}

/** Multiplicateur pour passer du nombre de personnes de la recette à `personnes`. */
export function facteur(recette, personnes) {
  return personnes / recette.personnes;
}

const arrondir2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Quantité multipliée par le facteur, arrondie à 2 décimales ; null reste null. */
export function quantiteAjustee(quantite, multiplicateur) {
  return quantite === null ? null : arrondir2(quantite * multiplicateur);
}

/** Texte affiché : « 200 g », « 0,5 bouquet », « 3 » (pièce), « au goût ». */
export function formaterQuantite(quantite, unite) {
  if (quantite === null) return "au goût";
  const nombre = String(arrondir2(quantite)).replace(".", ",");
  if (!unite || unite === "pièce") return nombre;
  return `${nombre} ${unite}`;
}
