// Interface : De saison, fiche de recette, Livres. Tout le DOM est construit avec
// createElement / textContent (jamais innerHTML avec des données).
import {
  filtrerRecettes, typesDisponibles, saisonDuMois, facteur, quantiteAjustee, formaterQuantite,
  sourcesDisponibles, personnesDisponibles, ingredientsDisponibles,
} from "./lib.js";
import { chargerSemaine, sauverSemaine, basculer, definirPersonnes } from "./semaine.js";
import { lireRoute } from "./routes.js";
import { compilerCourses, texteCourses, chargerCoches, sauverCoches } from "./courses.js";

const vue = document.getElementById("vue");
const barre = document.getElementById("nav");

// Stockage protégé : s'il est refusé, la semaine reste valable le temps de la session.
function ouvrirStockage() {
  try {
    const s = window.localStorage;
    s.getItem("compilation-recettes.test");
    return s;
  } catch {
    return { getItem() { return null; }, setItem() {} };
  }
}
const stockage = ouvrirStockage();

let donnees = null; // { recettes, ingredients, livres }
let semaine = {};
// Filtres de l'écran « De saison », conservés pendant la session.
// saison : « auto » = la saison du moment, "" = toute l'année.
const FILTRES_PAR_DEFAUT = { saison: "auto", livre: "", categorie: "", type: "", temps: 0, personnes: 0, ingredient: "" };
const filtres = { ...FILTRES_PAR_DEFAUT, recherche: "", ouvert: false, rechercheOuverte: false };
// Nombre de personnes choisi sur la fiche, par recette (pour les recettes hors semaine).
const personnesFiche = {};
// Ingrédients cochés sur la fiche, par recette (le temps de la session).
const cocheesFiche = new Map();
// Nombre d'écrans vus : tant qu'il n'y en a qu'un, « Retour » mène à la liste au lieu de quitter le site.
let ecransVus = 0;
function retourListe() {
  if (ecransVus > 1) window.history.back();
  else window.location.hash = "#/";
}
// Étape affichée en mode cuisine, par recette (le temps de la session).
const etapeCuisine = new Map();
let ingredientsOuverts = false;

// Nombre de personnes d'une recette : celui de « Ma semaine » s'il y est, sinon celui choisi sur la fiche, sinon celui du livre.
function personnesPour(recette) {
  if (Object.hasOwn(semaine, recette.id)) return semaine[recette.id];
  return personnesFiche[recette.id] ?? recette.personnes;
}

// Écran allumé pendant qu'on cuisine (fiche et mode pas à pas). Sans effet si le téléphone ne le permet pas.
let verrouEcran = null;
let ecranAllumeVoulu = false;
async function garderEcranAllume(actif) {
  ecranAllumeVoulu = actif;
  try {
    if (!actif) {
      const ancien = verrouEcran;
      verrouEcran = null;
      await ancien?.release();
      return;
    }
    if (verrouEcran || !("wakeLock" in navigator)) return;
    verrouEcran = await navigator.wakeLock.request("screen");
    verrouEcran.addEventListener("release", () => { verrouEcran = null; });
  } catch {
    verrouEcran = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ecranAllumeVoulu) garderEcranAllume(true);
});

function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [cle, val] of Object.entries(attrs)) {
    if (val === null || val === undefined || val === false) continue;
    if (cle === "class") el.className = val;
    else if (cle.startsWith("on")) el.addEventListener(cle.slice(2), val);
    else el.setAttribute(cle, val === true ? "" : String(val));
  }
  for (const e of enfants.flat()) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}

// Les écrans se redessinent en entier : on note le contrôle actif (data-cle) puis on lui rend le focus.
// Si le contrôle a disparu (ex. « Retirer »), le focus passe au titre de l'écran.
function gardantLeFocus(redessiner) {
  const cle = document.activeElement?.dataset?.cle;
  redessiner();
  if (!cle) return;
  const cible = vue.querySelector(`[data-cle="${CSS.escape(cle)}"]`) ?? vue.querySelector("h1");
  if (cible) {
    if (!cible.matches("button, a, input")) cible.setAttribute("tabindex", "-1");
    cible.focus();
  }
}

const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const lienRecette = (id) => `#/recette/${encodeURIComponent(id)}`;

// ---------- Barre de navigation ----------
const ICONES = {
  saison: ["M5 19c0-8 5-14 14-14 0 9-6 14-14 14z", "M5 19l8-8"],
  semaine: ["M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M4 10h16M9 3v4M15 3v4"],
  livres: ["M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z", "M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"],
  courses: ["M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6", "M10 20.5v.01M17 20.5v.01"],
  loupe: ["M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z", "M16 16l4.5 4.5"],
  filtres: ["M4 7h10M18 7h2M4 17h2M10 17h10", "M16 4v6M8 14v6"],
  retour: ["M15 5l-7 7 7 7"],
  bol: ["M4 11h16a8 8 0 0 1-16 0z", "M8 7l6-3M12 8l3-4"],
};
const ONGLETS = [
  { nom: "saison", libelle: "De saison", href: "#/" },
  { nom: "semaine", libelle: "Ma semaine", href: "#/semaine" },
  { nom: "courses", libelle: "Courses", href: "#/courses" },
  { nom: "livres", libelle: "Livres", href: "#/livres" },
];

function icone(nom) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONES[nom]) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

function dessinerBarre(nomActif) {
  barre.replaceChildren(
    ...ONGLETS.map((o) =>
      h("a", { href: o.href, "aria-current": o.nom === nomActif ? "page" : null }, icone(o.nom), o.libelle)
    )
  );
}

// ---------- Éléments communs ----------
function tempsTotal(recette) {
  const t = recette.temps;
  if (!t) return "";
  const total = (t.preparation ?? 0) + (t.cuisson ?? 0);
  return total > 0 ? `${total} min` : "";
}

// Photo du plat ; sans photo (livre pas encore photographié), un aplat avec l'initiale.
function photoRecette(recette, premierPlan = false) {
  if (!recette.photo) return h("div", { class: "photo vide", "aria-hidden": "true" }, recette.titre.charAt(0).toUpperCase());
  return h("figure", { class: "photo" },
    h("img", {
      src: recette.photo, alt: recette.titre, width: 800, height: 800,
      loading: premierPlan ? "eager" : "lazy", decoding: "async", fetchpriority: premierPlan ? "high" : null,
    }));
}

function carteRecette(recette) {
  const temps = tempsTotal(recette);
  return h("a", { class: "carte", href: lienRecette(recette.id) },
    photoRecette(recette),
    h("div", { class: "carte-bandeau" },
      h("h2", {}, recette.titre),
      temps ? h("span", { class: "carte-temps" }, temps) : null));
}

function messageErreur(texte, avecRetour = false) {
  return h("div", {},
    avecRetour ? h("a", { class: "retour", href: "#/" }, "‹ Retour") : null,
    h("p", { class: "erreur", role: "alert" }, texte));
}

// ---------- Écran « De saison » ----------
const SAISONS_PUCES = ["printemps", "été", "automne", "hiver"];
const CATEGORIES_ONGLETS = [
  { valeur: "", libelle: "Tout" }, { valeur: "entrée", libelle: "Entrées" },
  { valeur: "plat", libelle: "Plats" }, { valeur: "dessert", libelle: "Desserts" },
];
const TEMPS_PUCES = [{ libelle: "30 min max", minutes: 30 }, { libelle: "1 h max", minutes: 60 }];
const deSaison = (saison) => (saison === "printemps" ? "de printemps" : `d'${saison}`);

function ecranSaison() {
  const { recettes, ingredients, livres } = donnees;
  const saisonActuelle = saisonDuMois(new Date());
  const titre = h("h1", {});
  const sousTitre = h("p", { class: "sub" });
  const onglets = h("div", { class: "onglets", role: "group", "aria-label": "Catégorie" });
  const categories = CATEGORIES_ONGLETS.filter((c) => c.valeur === "" || recettes.some((r) => r.categorie === c.valeur));
  const liste = h("div", { class: "liste" });
  const panneau = h("div", { class: "panneau", id: "panneau-filtres" });
  const pastille = h("span", { class: "pastille" });
  const boutonFiltres = h("button", {
    type: "button", class: "rond btn-filtres", "data-cle": "ouvrir-filtres", "aria-controls": "panneau-filtres", "aria-label": "Filtres",
    onclick: () => { filtres.ouvert = !filtres.ouvert; actualiserPanneauVisible(); },
  }, icone("filtres"), pastille);
  const boutonRecherche = h("button", {
    type: "button", class: "rond", "data-cle": "ouvrir-recherche", "aria-controls": "recherche", "aria-label": "Rechercher",
    onclick: () => {
      filtres.rechercheOuverte = !filtres.rechercheOuverte;
      actualiserRechercheVisible();
      if (filtres.rechercheOuverte) recherche.focus();
    },
  }, icone("loupe"));
  const boutonVoir = h("button", {
    type: "button", class: "btn", "data-cle": "voir-resultats",
    onclick: () => { filtres.ouvert = false; actualiserPanneauVisible(); window.scrollTo(0, 0); },
  });
  const effacer = h("button", { type: "button", class: "effacer", "data-cle": "effacer-filtres", onclick: () => reinitialiser() }, "Tout effacer");
  const choixIngredient = h("select", {
    id: "filtre-ingredient", class: "choix", "data-cle": "filtre-ingredient",
    onchange: (e) => { filtres.ingredient = e.target.value; actualiserTout(); },
  },
  h("option", { value: "" }, "Tous"),
  ...ingredientsDisponibles(recettes, ingredients).map((i) => h("option", { value: i.id }, i.nom)));

  const sources = sourcesDisponibles(recettes, livres);
  const types = typesDisponibles(recettes);
  const personnes = personnesDisponibles(recettes);

  const actifsDe = (cles) => cles.filter((cle) => filtres[cle] !== FILTRES_PAR_DEFAUT[cle]).length;
  // La pastille du bouton « Filtres » ne compte pas la catégorie : elle a ses propres onglets, toujours visibles.
  const nombreActifs = () => actifsDe(Object.keys(FILTRES_PAR_DEFAUT).filter((cle) => cle !== "categorie"));
  const afficherEffacer = () => actifsDe(Object.keys(FILTRES_PAR_DEFAUT)) > 0;

  function puce(cle, valeur, libelle) {
    const actif = filtres[cle] === valeur;
    return h("button", {
      type: "button", class: "puce", "data-cle": `puce-${cle}-${valeur}`, "aria-pressed": String(actif),
      onclick: () => { filtres[cle] = valeur; gardantLeFocus(actualiserPanneau); actualiserListe(); },
    }, libelle);
  }

  function groupe(libelle, ...puces) {
    return h("div", { class: "groupe", role: "group", "aria-label": libelle },
      h("p", { class: "groupe-titre" }, libelle), h("div", { class: "puces" }, puces));
  }

  function actualiserPanneauVisible() {
    panneau.hidden = !filtres.ouvert;
    boutonFiltres.setAttribute("aria-expanded", String(filtres.ouvert));
  }

  function actualiserRechercheVisible() {
    const visible = filtres.rechercheOuverte || filtres.recherche !== "";
    zoneRecherche.hidden = !visible;
    boutonRecherche.setAttribute("aria-expanded", String(visible));
  }

  function actualiserOnglets() {
    onglets.replaceChildren(...categories.map((c) =>
      h("button", {
        type: "button", class: "onglet", "data-cle": `onglet-${c.valeur || "tout"}`, "aria-pressed": String(filtres.categorie === c.valeur),
        onclick: () => { filtres.categorie = c.valeur; gardantLeFocus(actualiserOnglets); actualiserListe(); },
      }, c.libelle)));
  }

  function actualiserPanneau() {
    choixIngredient.value = filtres.ingredient;
    panneau.replaceChildren(...[
      groupe("Saison", puce("saison", "auto", "De saison"), puce("saison", "", "Toutes"),
        ...SAISONS_PUCES.map((x) => puce("saison", x, majuscule(x)))),
      sources.length > 1 ? groupe("Livre", puce("livre", "", "Tous"), ...sources.map((x) => puce("livre", x.id, x.titre))) : null,
      types.length > 1 ? groupe("Type", puce("type", "", "Tous"), ...types.map((x) => puce("type", x, majuscule(x)))) : null,
      groupe("Temps (préparation + cuisson)", puce("temps", 0, "Tous"), ...TEMPS_PUCES.map((x) => puce("temps", x.minutes, x.libelle))),
      personnes.length > 1 ? groupe("Pour", puce("personnes", 0, "Tous"), ...personnes.map((n) => puce("personnes", n, `${n} personnes`))) : null,
      h("div", { class: "groupe" },
        h("label", { class: "groupe-titre", for: "filtre-ingredient" }, "Ingrédient"), choixIngredient),
      boutonVoir].filter(Boolean));
    const actifs = nombreActifs();
    pastille.textContent = actifs ? String(actifs) : "";
    pastille.hidden = actifs === 0;
    effacer.hidden = !afficherEffacer();
  }

  function actualiserListe() {
    const saison = filtres.saison === "auto" ? saisonActuelle : filtres.saison;
    const trouvees = filtrerRecettes(recettes, ingredients, {
      saison, categorie: filtres.categorie, type: filtres.type, recherche: filtres.recherche,
      livre: filtres.livre, tempsMax: filtres.temps, personnes: filtres.personnes, ingredient: filtres.ingredient,
    });
    const base = filtres.saison === "auto" ? "De saison" : saison ? `Recettes ${deSaison(saison)}` : "Toutes les recettes";
    titre.textContent = `${base} (${trouvees.length})`;
    sousTitre.textContent = saison ? majuscule(saison) : "Toute l'année";
    boutonVoir.textContent = `Voir ${trouvees.length} recette${trouvees.length > 1 ? "s" : ""}`;
    liste.replaceChildren(
      ...(trouvees.length
        ? trouvees.map(carteRecette)
        : [h("div", { class: "vide" }, "Aucune recette avec ces filtres.",
            h("button", { type: "button", class: "lien-action", onclick: () => reinitialiser() }, "Tout effacer"))]));
    const actifs = nombreActifs();
    pastille.textContent = actifs ? String(actifs) : "";
    pastille.hidden = actifs === 0;
    effacer.hidden = !afficherEffacer();
  }

  function actualiserTout() { actualiserOnglets(); actualiserPanneau(); actualiserListe(); }

  function reinitialiser() {
    Object.assign(filtres, FILTRES_PAR_DEFAUT);
    gardantLeFocus(actualiserTout);
  }

  const recherche = h("input", {
    type: "search", id: "recherche", placeholder: "Titre ou ingrédient (ex. oignon)",
    "aria-label": "Rechercher", autocomplete: "off", value: filtres.recherche,
    oninput: (e) => { filtres.recherche = e.target.value; actualiserListe(); },
  });
  const zoneRecherche = h("div", { class: "zone-recherche" }, recherche);

  actualiserPanneauVisible();
  actualiserRechercheVisible();
  actualiserTout();
  return h("div", {},
    h("header", { class: "entete" },
      h("p", { class: "marque" }, icone("bol"), "Compilation des recettes"),
      h("div", { class: "boutons-entete" }, boutonFiltres, boutonRecherche)),
    zoneRecherche,
    titre, sousTitre, onglets,
    h("div", { class: "rangee-filtres" }, effacer),
    panneau, liste);
}

// ---------- Fiche de recette ----------
function ecranRecette(idBrut) {
  let id;
  try {
    id = decodeURIComponent(idBrut);
  } catch {
    return messageErreur("Recette introuvable", true);
  }
  const recette = donnees.recettes.find((r) => r.id === id);
  if (!recette) return messageErreur("Recette introuvable", true);

  const conteneur = h("div");
  // Même élément à chaque redessin, pour que le lecteur d'écran annonce le nouveau nombre.
  const compteur = h("b", { "aria-live": "polite" });

  function personnesActuelles() {
    return personnesPour(recette);
  }

  function changerPersonnes(delta) {
    const n = Math.max(1, personnesActuelles() + delta);
    personnesFiche[id] = n;
    if (Object.hasOwn(semaine, id)) {
      semaine = definirPersonnes(semaine, id, n);
      sauverSemaine(stockage, semaine);
    }
    gardantLeFocus(dessiner);
  }

  function basculerSemaine() {
    const n = personnesActuelles();
    personnesFiche[id] = n;
    semaine = basculer(semaine, recette);
    if (Object.hasOwn(semaine, id)) semaine = definirPersonnes(semaine, id, n);
    sauverSemaine(stockage, semaine);
    gardantLeFocus(dessiner);
  }

  function dessiner() {
    const personnes = personnesActuelles();
    const mult = facteur(recette, personnes);
    const dansSemaine = Object.hasOwn(semaine, id);
    const nomsIngredients = new Map(donnees.ingredients.map((i) => [i.id, i.nom]));
    const o = recette.origine;
    const livre = o.type === "livre" ? donnees.livres.find((l) => l.id === o.livre) : null;

    const t = recette.temps;
    const ligneInfo = (libelle, ...contenu) => [h("dt", {}, libelle), h("dd", {}, ...contenu)];

    const cochees = cocheesFiche.get(id) ?? new Set();
    const ligneIngredient = (ligne, i) => {
      const caseACocher = h("input", {
        type: "checkbox", "data-cle": `coche-${i}`, checked: cochees.has(i),
        onchange: (e) => {
          const ensemble = cocheesFiche.get(id) ?? new Set();
          if (e.target.checked) ensemble.add(i); else ensemble.delete(i);
          cocheesFiche.set(id, ensemble);
          e.target.closest("label").classList.toggle("fait", e.target.checked);
        },
      });
      caseACocher.checked = cochees.has(i);
      return h("label", { class: `ing${cochees.has(i) ? " fait" : ""}` },
        caseACocher,
        h("span", { class: "nom" },
          h("b", { class: "quantite" }, formaterQuantite(quantiteAjustee(ligne.quantite, mult), ligne.unite)), " ",
          nomsIngredients.get(ligne.ingredient) ?? ligne.ingredient,
          ligne.precision ? h("small", {}, ` (${ligne.precision})`) : null));
    };

    conteneur.replaceChildren(
      h("div", { class: "fiche-tete" },
        h("div", { class: "fiche-photo" },
          photoRecette(recette, true),
          h("button", { type: "button", class: "rond retour", "aria-label": "Retour", onclick: retourListe }, icone("retour")),
          h("button", { type: "button", "data-cle": "bascule-semaine", class: `pilule${dansSemaine ? " active" : ""}`, onclick: basculerSemaine },
            dansSemaine ? "Retirer de ma semaine et des courses" : "Ajouter à ma semaine et aux courses"),
          h("div", { class: "fiche-titre" },
            h("h1", { class: "titre-recette" }, recette.titre),
            h("p", {}, majuscule(recette.categorie), " • ", recette.saisons.join(", ")))),
        h("dl", { class: "infos" },
          o.type === "livre"
            ? ligneInfo("Livre", livre ? livre.titre : o.livre, `, page ${o.page}`)
            : ligneInfo("Source", /^https?:\/\//i.test(o.url) ? h("a", { href: o.url, target: "_blank", rel: "noopener noreferrer" }, o.source) : o.source),
          ligneInfo("Portions",
            h("span", { class: "pas" },
              h("button", { type: "button", "data-cle": "pas-moins", "aria-label": "Moins de personnes", onclick: () => changerPersonnes(-1) }, "−"),
              compteur,
              h("button", { type: "button", "data-cle": "pas-plus", "aria-label": "Plus de personnes", onclick: () => changerPersonnes(1) }, "+"),
              h("span", { class: "ou" }, personnes > 1 ? "personnes" : "personne")),
            h("small", { class: "note-livre" },
              `Recette du livre pour ${recette.personnes} personne${recette.personnes > 1 ? "s" : ""}`,
              recette.personnes_texte ? ` (${recette.personnes_texte})` : "")),
          t && t.preparation ? ligneInfo("Préparation", `${t.preparation} min`) : null,
          t && t.cuisson ? ligneInfo("Cuisson", `${t.cuisson} min`) : null),
        recette.etapes.length
          ? h("a", { class: "btn btn-cuisine", href: `#/cuisine/${encodeURIComponent(id)}` }, "Cuisiner pas à pas")
          : null),
      h("div", { class: "fiche-corps" },
        h("section", {},
          h("h2", { class: "section" }, "Ingrédients"),
          recette.ingredients.map(ligneIngredient)),
        h("section", {},
          h("h2", { class: "section" }, "Préparation"),
          ...recette.etapes.map((texte, i) =>
            h("div", { class: "etape" }, h("span", {}, String(i + 1)), h("div", {}, texte))),
          recette.notes && recette.notes.length
            ? h("div", {}, h("h2", { class: "section" }, "Notes"),
                h("ul", { class: "notes" }, recette.notes.map((n) => h("li", {}, n))))
            : null)));
    compteur.textContent = String(personnes);
  }

  dessiner();
  return conteneur;
}

// ---------- Mode cuisine : une étape à la fois, en gros ----------
function ecranCuisine(idBrut) {
  let id;
  try {
    id = decodeURIComponent(idBrut);
  } catch {
    return messageErreur("Recette introuvable", true);
  }
  const recette = donnees.recettes.find((r) => r.id === id);
  if (!recette || !recette.etapes.length) return messageErreur("Recette introuvable", true);

  const etapes = recette.etapes;
  const noms = new Map(donnees.ingredients.map((i) => [i.id, i.nom]));
  let n = Math.min(etapeCuisine.get(id) ?? 0, etapes.length - 1);
  const conteneur = h("div", { class: "cuisine" });

  function aller(delta) {
    n = Math.max(0, Math.min(etapes.length - 1, n + delta));
    etapeCuisine.set(id, n);
    gardantLeFocus(dessiner);
    window.scrollTo(0, 0);
  }

  function dessiner() {
    const personnes = personnesPour(recette);
    const mult = facteur(recette, personnes);
    const derniere = n === etapes.length - 1;
    conteneur.replaceChildren(
      h("div", { class: "cuisine-tete" },
        h("a", { class: "rond", href: lienRecette(id), "aria-label": "Quitter le mode pas à pas" }, icone("retour")),
        h("h1", { class: "cuisine-titre" }, recette.titre)),
      h("p", { class: "cuisine-progres", "aria-live": "polite" }, `Étape ${n + 1} sur ${etapes.length}`),
      h("div", { class: "cuisine-barre", "aria-hidden": "true" }, h("span", { style: `width:${((n + 1) / etapes.length) * 100}%` })),
      h("p", { class: "cuisine-etape" }, etapes[n]),
      h("details", {
        class: "cuisine-ingredients", open: ingredientsOuverts,
        ontoggle: (e) => { ingredientsOuverts = e.target.open; },
      },
      h("summary", {}, `Ingrédients pour ${personnes} personne${personnes > 1 ? "s" : ""}`),
      recette.ingredients.map((ligne) =>
        h("p", { class: "cuisine-ing" },
          h("b", {}, formaterQuantite(quantiteAjustee(ligne.quantite, mult), ligne.unite)), " ",
          noms.get(ligne.ingredient) ?? ligne.ingredient,
          ligne.precision ? h("small", {}, ` (${ligne.precision})`) : null))),
      h("div", { class: "cuisine-pas" },
        h("button", { type: "button", class: "btn alt", "data-cle": "precedent", disabled: n === 0, onclick: () => aller(-1) }, "Précédent"),
        derniere
          ? h("a", { class: "btn", href: lienRecette(id) }, "Terminé")
          : h("button", { type: "button", class: "btn", "data-cle": "suivant", onclick: () => aller(1) }, "Suivant")));
  }

  dessiner();
  return conteneur;
}

// ---------- Écran « Courses » ----------
function copierSecours(texte) {
  const zone = h("textarea", { "aria-hidden": "true", style: "position:fixed;opacity:0;top:0" });
  zone.value = texte;
  document.body.append(zone);
  zone.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  zone.remove();
  return ok;
}

function ecranCourses() {
  const conteneur = h("div");
  const etat = { coches: chargerCoches(stockage), message: "" };

  function cocher(cle, coche) {
    if (coche) etat.coches.add(cle); else etat.coches.delete(cle);
    sauverCoches(stockage, etat.coches);
    etat.message = "";
    gardantLeFocus(dessiner);
  }

  async function copier(liste) {
    const texte = texteCourses(liste, etat.coches);
    let ok = false;
    try {
      await navigator.clipboard.writeText(texte);
      ok = true;
    } catch {
      ok = copierSecours(texte);
    }
    etat.message = ok ? "Liste copiée." : "Copie impossible : sélectionnez la liste à la main.";
    gardantLeFocus(dessiner);
  }

  function ligne(item) {
    const coche = etat.coches.has(item.cle);
    const caseACocher = h("input", { type: "checkbox", "data-cle": `coche-${item.cle}`, onchange: (e) => cocher(item.cle, e.target.checked) });
    caseACocher.checked = coche;
    return h("label", { class: `ing${coche ? " fait" : ""}` },
      caseACocher,
      h("span", { class: "nom" },
        item.texte ? h("b", { class: "quantite" }, item.texte) : null, item.texte ? " " : null, item.nom,
        item.melange ? h("small", { class: "alerte" }, "Unités différentes selon les recettes : à vérifier") : null,
        h("small", { class: "origine" }, item.recettes.join(" · "))));
  }

  function dessiner() {
    const liste = compilerCourses(donnees.recettes, donnees.ingredients, semaine);
    const tous = [...liste.groupes.flatMap((g) => g.items), ...liste.placard];
    const restants = tous.filter((i) => !etat.coches.has(i.cle)).length;
    if (!liste.recettes) {
      conteneur.replaceChildren(
        h("h1", {}, "Courses"),
        h("div", { class: "vide" },
          "La liste est vide. Ouvrez une recette et touchez « Ajouter à ma semaine et aux courses ».",
          h("a", { class: "lien-action", href: "#/" }, "Voir les recettes")));
      return;
    }
    conteneur.replaceChildren(
      h("h1", {}, "Courses"),
      h("p", { class: "sub" }, `${liste.recettes} recette${liste.recettes > 1 ? "s" : ""} · ${restants} article${restants > 1 ? "s" : ""} à acheter sur ${tous.length}`),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "lien-action", "data-cle": "copier", onclick: () => copier(liste) }, "Copier la liste"),
        h("button", { type: "button", class: "lien-action", "data-cle": "decocher", onclick: () => { etat.coches.clear(); sauverCoches(stockage, etat.coches); etat.message = ""; gardantLeFocus(dessiner); } }, "Tout décocher")),
      h("p", { class: "sub statut", role: "status" }, etat.message),
      ...liste.groupes.map((g) => h("section", {}, h("h2", { class: "section" }, g.titre), g.items.map(ligne))),
      liste.placard.length
        ? h("section", {}, h("h2", { class: "section" }, "À vérifier au placard"), liste.placard.map(ligne))
        : null);
  }

  dessiner();
  return conteneur;
}

// ---------- Écran « Livres » ----------
function ecranLivres() {
  const { recettes, livres } = donnees;
  const cartes = livres.map((livre) => {
    const siennes = recettes
      .filter((r) => r.origine.type === "livre" && r.origine.livre === livre.id)
      .sort((a, b) => a.origine.page - b.origine.page);
    return h("section", { class: "card" },
      h("h2", {}, livre.titre),
      livre.auteur ? h("div", { class: "ou" }, livre.auteur) : null,
      h("div", { style: "margin-top:8px" },
        siennes.length
          ? siennes.map((r) =>
              h("a", { class: "livre-ligne", href: lienRecette(r.id) },
                h("span", {}, r.titre), h("span", { class: "qte" }, `p. ${r.origine.page}`)))
          : h("div", { class: "ou" }, "Aucune recette pour le moment.")));
  });
  const web = recettes.filter((r) => r.origine.type === "web");
  if (web.length) {
    cartes.push(h("section", { class: "card" },
      h("h2", {}, "Recettes d'internet"),
      h("div", { style: "margin-top:8px" },
        web.map((r) =>
          h("a", { class: "livre-ligne", href: lienRecette(r.id) },
            h("span", {}, r.titre), h("span", { class: "tag web" }, r.origine.source || "Internet"))))));
  }
  return h("div", {},
    h("h1", {}, "Livres"),
    h("p", { class: "sub" }, `${livres.length} livre${livres.length > 1 ? "s" : ""} · retrouvez la page`),
    h("div", { class: "stack" }, cartes));
}

// ---------- Écran « Ma semaine » ----------
function ecranSemaine() {
  const conteneur = h("div");
  const compteurs = new Map(); // un compteur durable par recette (voir la fiche)

  function changerPersonnes(recette, delta) {
    semaine = definirPersonnes(semaine, recette.id, Math.max(1, semaine[recette.id] + delta));
    sauverSemaine(stockage, semaine);
    gardantLeFocus(dessiner);
  }

  function retirer(recette) {
    semaine = basculer(semaine, recette);
    sauverSemaine(stockage, semaine);
    gardantLeFocus(dessiner);
  }

  function carteSemaine(recette) {
    const personnes = semaine[recette.id];
    if (!compteurs.has(recette.id)) compteurs.set(recette.id, h("b", { "aria-live": "polite" }));
    const compteur = compteurs.get(recette.id);
    compteur.textContent = String(personnes);
    return h("section", { class: "card" },
      h("h2", {}, recette.titre),
      h("div", { class: "ligne", style: "align-items:center; margin-top:10px" },
        h("b", {}, "Pour"),
        h("div", { class: "pas" },
          h("button", { type: "button", "data-cle": `pas-moins-${recette.id}`, "aria-label": `Moins de personnes pour ${recette.titre}`, onclick: () => changerPersonnes(recette, -1) }, "−"),
          compteur,
          h("button", { type: "button", "data-cle": `pas-plus-${recette.id}`, "aria-label": `Plus de personnes pour ${recette.titre}`, onclick: () => changerPersonnes(recette, 1) }, "+"),
          h("span", { class: "ou", style: "margin:0" }, personnes > 1 ? "personnes" : "personne"))),
      h("div", { class: "actions" },
        h("a", { class: "lien-action", href: lienRecette(recette.id) }, "Voir la fiche"),
        h("button", { type: "button", class: "lien-action", "data-cle": `retirer-${recette.id}`, onclick: () => retirer(recette) }, "Retirer")));
  }

  function dessiner() {
    // Les recettes enregistrées mais disparues des données sont ignorées.
    const choisies = Object.keys(semaine)
      .map((id) => donnees.recettes.find((r) => r.id === id))
      .filter(Boolean);
    conteneur.replaceChildren(
      h("h1", {}, "Ma semaine"),
      h("p", { class: "sub" }, `${choisies.length} recette${choisies.length > 1 ? "s" : ""}`),
      choisies.length ? h("div", { class: "actions" }, h("a", { class: "lien-action", href: "#/courses" }, "Voir la liste de courses")) : null,
      choisies.length
        ? h("div", { class: "stack" }, choisies.map(carteSemaine))
        : h("div", { class: "vide" }, "Rien pour l'instant. Ouvrez une recette et touchez « Ajouter à ma semaine et aux courses »."));
  }

  dessiner();
  return conteneur;
}

// ---------- Affichage ----------
function afficher() {
  if (!donnees) return;
  const route = lireRoute(window.location.hash);
  const ecrans = {
    saison: ecranSaison,
    semaine: ecranSemaine,
    courses: ecranCourses,
    livres: ecranLivres,
    recette: () => ecranRecette(route.id),
    cuisine: () => ecranCuisine(route.id),
  };
  ecransVus += 1;
  dessinerBarre(route.nom === "recette" || route.nom === "cuisine" ? "saison" : route.nom);
  barre.closest(".barre").hidden = route.nom === "cuisine";
  garderEcranAllume(route.nom === "recette" || route.nom === "cuisine");
  vue.className = "app" + (route.nom === "saison" ? " large" : route.nom === "recette" ? " fiche-large" : "");
  vue.replaceChildren(ecrans[route.nom]());
  window.scrollTo(0, 0);
}

async function lireJson(chemin) {
  const reponse = await fetch(chemin);
  if (!reponse.ok) throw new Error(`${chemin} : ${reponse.status}`);
  return reponse.json();
}

async function demarrer() {
  dessinerBarre("saison");
  try {
    const [recettes, ingredients, livres] = await Promise.all([
      lireJson("data/recettes.json"),
      lireJson("data/ingredients.json"),
      lireJson("data/livres.json"),
    ]);
    donnees = { recettes, ingredients, livres };
    semaine = chargerSemaine(stockage, recettes);
  } catch {
    vue.replaceChildren(messageErreur("Impossible de charger les recettes"));
    return;
  }
  window.addEventListener("hashchange", afficher);
  afficher();
}

demarrer();
