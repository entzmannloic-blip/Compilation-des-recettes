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

/** Temps total en minutes (préparation + cuisson) ; null si le livre n'en donne aucun. */
export function tempsTotalMinutes(recette) {
  const t = recette.temps;
  if (!t || (t.preparation == null && t.cuisson == null)) return null;
  return (t.preparation ?? 0) + (t.cuisson ?? 0);
}

/**
 * Filtres combinés en « et », résultat trié par titre.
 * livre : id d'un livre, ou « web » ; tempsMax : minutes (les recettes sans temps connu sont écartées) ;
 * personnes : nombre de personnes de la recette ; ingredient : id d'un ingrédient.
 */
export function filtrerRecettes(recettes, ingredients, { saison, categorie, type, recherche, livre, tempsMax, personnes, ingredient } = {}) {
  const nomsParId = new Map(ingredients.map((i) => [i.id, normaliser(i.nom)]));
  const motif = recherche ? normaliser(recherche) : "";
  return recettes
    .filter((r) => !saison || r.saisons.includes(saison))
    .filter((r) => !categorie || r.categorie === categorie)
    .filter((r) => !type || r.type === type)
    .filter((r) => {
      if (!livre) return true;
      return livre === "web" ? r.origine?.type === "web" : r.origine?.type === "livre" && r.origine.livre === livre;
    })
    .filter((r) => {
      if (!tempsMax) return true;
      const t = tempsTotalMinutes(r);
      return t !== null && t <= tempsMax;
    })
    .filter((r) => !personnes || r.personnes === personnes)
    .filter((r) => !ingredient || r.ingredients.some((ligne) => ligne.ingredient === ingredient))
    .filter((r) => {
      if (!motif) return true;
      if (normaliser(r.titre).includes(motif)) return true;
      return r.ingredients.some((ligne) => (nomsParId.get(ligne.ingredient) ?? "").includes(motif));
    })
    .sort((a, b) => normaliser(a.titre).localeCompare(normaliser(b.titre), "fr"));
}

/** Livres qui ont au moins une recette, plus « Internet » s'il y a des recettes web. */
export function sourcesDisponibles(recettes, livres) {
  const sources = livres
    .filter((l) => recettes.some((r) => r.origine?.type === "livre" && r.origine.livre === l.id))
    .map((l) => ({ id: l.id, titre: l.titre }));
  if (recettes.some((r) => r.origine?.type === "web")) sources.push({ id: "web", titre: "Internet" });
  return sources;
}

/** Nombres de personnes présents dans les recettes, sans doublon, croissants. */
export function personnesDisponibles(recettes) {
  return [...new Set(recettes.map((r) => r.personnes))].sort((a, b) => a - b);
}

/**
 * Ingrédients présents dans au moins `minimum` recettes (quantifiés), triés par nom : ceux qui servent
 * vraiment à choisir une recette. Les ingrédients « de base » jamais quantifiés (sel, poivre, huile d'olive…)
 * et ceux d'une seule recette (la recherche les trouve) sont écartés.
 */
export function ingredientsDisponibles(recettes, ingredients, minimum = 2) {
  const nombre = new Map();
  for (const r of recettes) {
    for (const id of new Set(r.ingredients.filter((ligne) => ligne.quantite !== null).map((ligne) => ligne.ingredient))) {
      nombre.set(id, (nombre.get(id) ?? 0) + 1);
    }
  }
  return ingredients
    .filter((i) => (nombre.get(i.id) ?? 0) >= minimum)
    .map((i) => ({ id: i.id, nom: i.nom }))
    .sort((a, b) => normaliser(a.nom).localeCompare(normaliser(b.nom), "fr"));
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
