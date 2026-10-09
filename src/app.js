// Interface : De saison, fiche de recette, Livres. Tout le DOM est construit avec
// createElement / textContent (jamais innerHTML avec des données).
import {
  filtrerRecettes, typesDisponibles, saisonDuMois, facteur, quantiteAjustee, formaterQuantite,
  sourcesDisponibles, recettesWebParSite, personnesDisponibles, ingredientsDisponibles, regimeRecette,
} from "./lib.js";
import { chargerSemaine, sauverSemaine, basculer, definirPersonnes } from "./semaine.js";
import { lireRoute } from "./routes.js";
import { chargerListe, sauverListe, basculerFavori, CLES } from "./memoire.js";
import {
  NOMS_MOIS, MOIS_DE_SAISON, saisonDuMoisNumero, alimentsDuMois, alimentsDeLaSaison, chercherAliments, libelleMois,
  moisParIngredient, recettesAvecAliment, moisAvantSaison,
} from "./saison.js";
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

let donnees = null; // { recettes, ingredients, livres, saisonnalite }
let semaine = {};
// Favoris, gardés sur le téléphone.
let favoris = new Set(chargerListe(stockage, CLES.favoris));
// Filtres de l'écran « Recettes », conservés pendant la session.
// saisons : null = la saison du moment ; liste de saisons choisies ; [] = toute l'année.
const FILTRES_PAR_DEFAUT = { saisons: null, livre: "", categorie: "", type: "", temps: 0, personnes: 0, ingredient: "", regime: "", favoris: false };
const filtres = { ...FILTRES_PAR_DEFAUT, recherche: "", ouvert: false, rechercheOuverte: false };
// Nombre de personnes choisi sur la fiche, par recette (pour les recettes hors semaine).
const personnesFiche = {};
// Ingrédients cochés sur la fiche, par recette (le temps de la session).
const cocheesFiche = new Map();
// Rang de l'écran dans l'historique du navigateur (0 = première entrée de l'onglet), gardé dans l'état de chaque entrée :
// « Fermer » ne revient en arrière que s'il y a bien une page du site avant, sinon il mène à la liste.
let rangHistorique = 0;
let hashAvant = null; // adresse de l'écran précédemment affiché (null : premier écran de l'onglet)
function noterRang() {
  const etat = window.history.state;
  if (Number.isInteger(etat?.rang)) { rangHistorique = etat.rang; return; }
  const rang = hashAvant === null ? 0 : rangHistorique + 1;
  rangHistorique = rang;
  window.history.replaceState({ rang, precedent: hashAvant ?? "" }, "");
}
// Ferme la fiche comme une fenêtre : retour à la page d'où l'on vient (liste, courses, livres), jamais au mode pas à pas.
function fermerFiche() {
  const precedent = window.history.state?.precedent ?? "";
  const dejaVu = rangHistorique > 0 && precedent !== "" && !precedent.startsWith("#/cuisine/") && !precedent.startsWith("#/recette/");
  if (!dejaVu) { window.location.hash = "#/"; return; }
  const avant = window.location.hash;
  window.history.back();
  setTimeout(() => { if (window.location.hash === avant) window.location.hash = "#/"; }, 400);
}
// Étape affichée en mode cuisine, par recette (le temps de la session).
const etapeCuisine = new Map();
let ingredientsOuverts = false;

// Nombre de personnes d'une recette : celui de « Ma semaine » s'il y est, sinon celui choisi sur la fiche, sinon celui du livre.
function personnesPour(recette) {
  if (Object.hasOwn(semaine, recette.id)) return semaine[recette.id];
  return personnesFiche[recette.id] ?? recette.personnes;
}

// Ajoute ou retire la recette de la semaine (donc des courses) ; renvoie vrai si elle y est maintenant.
function basculerCourses(recette) {
  const n = personnesPour(recette);
  personnesFiche[recette.id] = n;
  semaine = basculer(semaine, recette);
  if (Object.hasOwn(semaine, recette.id)) semaine = definirPersonnes(semaine, recette.id, n);
  sauverSemaine(stockage, semaine);
  return Object.hasOwn(semaine, recette.id);
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
  calendrier: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z", "M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21"],
  courses: ["M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6", "M10 20.5v.01M17 20.5v.01"],
  loupe: ["M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z", "M16 16l4.5 4.5"],
  filtres: ["M4 7h10M18 7h2M4 17h2M10 17h10", "M16 4v6M8 14v6"],
  retour: ["M15 5l-7 7 7 7"],
  croix: ["M6 6l12 12M18 6L6 18"],
  bol: ["M4 11h16a8 8 0 0 1-16 0z", "M8 7l6-3M12 8l3-4"],
  plus: ["M12 5v14M5 12h14"],
  coche: ["M5 12.5l4.5 4.5L19 7.5"],
  croix: ["M6 6l12 12M18 6L6 18"],
  etoile: ["M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"],
};
const ONGLETS = [
  { nom: "saison", libelle: "Recettes", href: "#/" },
  { nom: "courses", libelle: "Courses", href: "#/courses" },
  { nom: "livres", libelle: "Livres", href: "#/livres" },
  { nom: "calendrier", libelle: "Saison", href: "#/saison" },
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

let ongletActif = "saison";
function dessinerBarre(nomActif = ongletActif) {
  ongletActif = nomActif;
  const choisies = Object.keys(semaine).length;
  barre.replaceChildren(
    ...ONGLETS.map((o) =>
      h("a", { href: o.href, "aria-current": o.nom === nomActif ? "page" : null },
        o.nom === "saison" ? h("span", { class: "logo-onglet", "aria-hidden": "true" }) : icone(o.nom), o.libelle,
        o.nom === "courses" && choisies ? h("span", { class: "badge" }, String(choisies)) : null)
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

// Photo du plat ; vignette légère pour les listes. Sans photo, un fond neutre avec un bol.
function photoRecette(recette, premierPlan = false, vignette = false) {
  if (!recette.photo) return h("div", { class: "photo vide", "aria-hidden": "true" }, icone("bol"));
  const src = vignette ? recette.photo.replace(/^photos\//, "photos/vignettes/") : recette.photo;
  const cote = vignette ? 400 : 800;
  return h("figure", { class: "photo" },
    h("img", {
      src, alt: recette.titre, width: cote, height: cote,
      loading: premierPlan ? "eager" : "lazy", decoding: "async", fetchpriority: premierPlan ? "high" : null,
    }));
}

// « Salade p. 20 » ou « Papilles et Pupilles » : d'où vient la recette, en court.
function lieuCourt(recette) {
  const o = recette.origine;
  if (o.type !== "livre") return o.source || "Internet";
  const livre = donnees.livres.find((l) => l.id === o.livre);
  return `${livre ? livre.titre : o.livre} p. ${o.page}`;
}

function carteRecette(recette) {
  const temps = tempsTotal(recette);
  const bouton = h("button", {
    type: "button", class: "ajout", "data-cle": `ajout-${recette.id}`,
    onclick: () => {
      const dedans = basculerCourses(recette);
      majBouton();
      dessinerBarre();
      annoncer(dedans ? "Ajouté aux courses" : "Retiré des courses", dedans ? { texte: "Voir la liste", href: "#/courses" } : null);
    },
  });
  function majBouton() {
    const dedans = Object.hasOwn(semaine, recette.id);
    bouton.setAttribute("aria-pressed", String(dedans));
    bouton.setAttribute("aria-label", dedans ? `Retirer ${recette.titre} des courses` : `Ajouter ${recette.titre} aux courses`);
    bouton.replaceChildren(icone(dedans ? "coche" : "plus"));
  }
  majBouton();
  return h("div", { class: "carte" },
    h("div", { class: "carte-photo" },
      h("a", { href: lienRecette(recette.id), tabindex: "-1", "aria-hidden": "true" }, photoRecette(recette, false, true)),
      bouton),
    h("a", { class: "carte-lien carte-bandeau", href: lienRecette(recette.id) },
      h("h2", {}, recette.titre),
      h("span", { class: "carte-temps" }, [temps, lieuCourt(recette)].filter(Boolean).join(" · "))));
}

// Petit message en bas de l'écran (« Ajouté aux courses · Voir la liste »), qui disparaît seul.
const messageBas = h("div", { class: "message-bas", role: "status", hidden: true });
document.body.append(messageBas);
let minuteurMessage = null;
function annoncer(texte, lien = null) {
  clearTimeout(minuteurMessage);
  messageBas.replaceChildren(...[texte, lien ? h("a", { href: lien.href }, lien.texte) : null].filter(Boolean));
  messageBas.hidden = false;
  minuteurMessage = setTimeout(cacherMessage, 4000);
}
function cacherMessage() {
  clearTimeout(minuteurMessage);
  messageBas.hidden = true;
}

function messageErreur(texte, avecRetour = false) {
  return h("div", {},
    avecRetour ? h("a", { class: "retour", href: "#/" }, "‹ Retour") : null,
    h("p", { class: "erreur", role: "alert" }, texte));
}

// ---------- Écran « Recettes » ----------
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
  const compte = h("p", { class: "compte", "aria-live": "polite" });
  const onglets = h("div", { class: "onglets", role: "group", "aria-label": "Catégorie" });
  const categories = CATEGORIES_ONGLETS.filter((c) => c.valeur === "" || recettes.some((r) => r.categorie === c.valeur));
  const liste = h("div", { class: "liste" });
  const panneau = h("div", { class: "panneau", id: "panneau-filtres" });
  const pastille = h("span", { class: "pastille" });
  const boutonFiltres = h("button", {
    type: "button", class: "rond btn-filtres", "data-cle": "ouvrir-filtres", "aria-controls": "panneau-filtres", "aria-label": "Filtres",
    onclick: () => { filtres.ouvert = !filtres.ouvert; actualiserPanneauVisible(); },
  }, icone("filtres"), pastille);
  const boutonFavoris = h("button", {
    type: "button", class: "rond favori", "data-cle": "filtre-favoris", "aria-label": "Afficher seulement les favoris",
    onclick: () => { filtres.favoris = !filtres.favoris; actualiserTout(); },
  }, icone("etoile"));
  const aide = chargerListe(stockage, CLES.aide).includes("accueil") ? null : h("div", { class: "aide", role: "note" },
    h("p", {}, "Touchez + sur une recette pour l'ajouter à vos courses : l'onglet Courses additionne tout et classe par rayon. L'étoile d'une fiche la garde en favori."),
    h("button", { type: "button", class: "lien-texte", "data-cle": "aide-ok", onclick: () => { sauverListe(stockage, CLES.aide, ["accueil"]); aide.remove(); } }, "Compris"));
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
  const puces_saisons = h("div", { class: "saisons-puces" });
  const saisonsChoisies = h("div", { class: "saisons", role: "group", "aria-label": "Saison" },
    h("span", { class: "saisons-titre" }, "Saison"), puces_saisons);
  const recherche = h("input", {
    type: "search", id: "recherche", class: "recherche", placeholder: "Rechercher une recette ou un ingrédient",
    "aria-label": "Rechercher", autocomplete: "off", value: filtres.recherche,
    oninput: (e) => { filtres.recherche = e.target.value; actualiserListe(); },
  });

  const sources = sourcesDisponibles(recettes, livres);
  const types = typesDisponibles(recettes);
  const personnes = personnesDisponibles(recettes);

  const actifsDe = (cles) => cles.filter((cle) => filtres[cle] !== FILTRES_PAR_DEFAUT[cle]).length;
  const AUTRES = Object.keys(FILTRES_PAR_DEFAUT).filter((cle) => cle !== "saisons");
  const saisonsActives = () => filtres.saisons ?? [saisonActuelle];
  const saisonsParDefaut = () => { const a = saisonsActives(); return a.length === 1 && a[0] === saisonActuelle; };
  // La pastille du bouton « Filtres » ne compte que le contenu du panneau : saisons, catégorie et favoris sont toujours visibles.
  const nombreActifs = () => actifsDe(AUTRES.filter((cle) => cle !== "categorie" && cle !== "favoris"));
  const afficherEffacer = () => actifsDe(AUTRES) > 0 || !saisonsParDefaut() || filtres.recherche !== "";

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
      sources.length > 1 ? groupe("Livre", puce("livre", "", "Tous"), ...sources.map((x) => puce("livre", x.id, x.titre))) : null,
      types.length > 1 ? groupe("Type", puce("type", "", "Tous"), ...types.map((x) => puce("type", x, majuscule(x)))) : null,
      groupe("Régime (déduit des ingrédients)", puce("regime", "", "Tous"), puce("regime", "vegetarien", "Végétarien"), puce("regime", "vegan", "Vegan")),
      groupe("Temps (préparation + cuisson)", puce("temps", 0, "Tous"), ...TEMPS_PUCES.map((x) => puce("temps", x.minutes, x.libelle))),
      personnes.length > 1 ? groupe("Pour", puce("personnes", 0, "Tous"), ...personnes.map((n) => puce("personnes", n, `${n} personnes`))) : null,
      h("div", { class: "groupe" },
        h("label", { class: "groupe-titre", for: "filtre-ingredient" }, "Ingrédient"), choixIngredient),
      boutonVoir].filter(Boolean));
    majIndicateurs();
  }

  function actualiserSaisons() {
    const actives = saisonsActives();
    puces_saisons.replaceChildren(...SAISONS_PUCES.map((x) =>
      h("button", {
        type: "button", class: "puce", "data-cle": `saison-${x}`, "aria-pressed": String(actives.includes(x)),
        onclick: () => {
          filtres.saisons = actives.includes(x) ? actives.filter((y) => y !== x) : [...actives, x];
          gardantLeFocus(actualiserSaisons);
          actualiserListe();
        },
      }, majuscule(x))));
  }

  function majIndicateurs() {
    boutonFavoris.setAttribute("aria-pressed", String(filtres.favoris));
    const actifs = nombreActifs();
    pastille.textContent = actifs ? String(actifs) : "";
    pastille.hidden = actifs === 0;
    effacer.hidden = !afficherEffacer();
  }

  // Rien trouvé : on dit pourquoi et on propose la sortie la plus utile.
  function pasDeResultat() {
    if (filtres.favoris && favoris.size === 0) {
      return h("div", { class: "vide" }, "Aucun favori pour le moment. Touchez l'étoile dans une fiche pour en ajouter.",
        h("button", { type: "button", class: "lien-action", "data-cle": "voir-tout", onclick: () => { filtres.favoris = false; actualiserTout(); } }, "Voir toutes les recettes"));
    }
    const seulementLaSaison = saisonsParDefaut() && !filtres.recherche && actifsDe(AUTRES) === 0;
    if (seulementLaSaison) {
      return h("div", { class: "vide" }, `Aucune recette de saison (${saisonActuelle}) pour le moment.`,
        h("button", { type: "button", class: "lien-action", "data-cle": "toute-annee", onclick: () => { filtres.saisons = []; gardantLeFocus(actualiserTout); } }, "Voir toutes les recettes"));
    }
    return h("div", { class: "vide" }, "Aucune recette ne correspond à ces filtres.",
      h("button", { type: "button", class: "lien-action", "data-cle": "tout-effacer-vide", onclick: () => reinitialiser() }, "Tout effacer"));
  }

  function actualiserListe() {
    // Recherche et favoris portent sur toute la bibliothèque : les saisons ne cachent pas les résultats.
    let trouvees = filtrerRecettes(recettes, ingredients, {
      saisons: filtres.recherche || filtres.favoris ? [] : saisonsActives(), categorie: filtres.categorie, type: filtres.type, recherche: filtres.recherche,
      livre: filtres.livre, tempsMax: filtres.temps, personnes: filtres.personnes, ingredient: filtres.ingredient, regime: filtres.regime,
    });
    if (filtres.favoris) trouvees = trouvees.filter((r) => favoris.has(r.id));
    saisonsChoisies.classList.toggle("ignore", Boolean(filtres.recherche || filtres.favoris));
    compte.textContent = filtres.recherche || filtres.favoris
      ? `${trouvees.length} résultat${trouvees.length > 1 ? "s" : ""} · toute l'année`
      : `${trouvees.length} sur ${recettes.length} recette${recettes.length > 1 ? "s" : ""}`;
    boutonVoir.textContent = `Voir ${trouvees.length} recette${trouvees.length > 1 ? "s" : ""}`;
    liste.replaceChildren(...(trouvees.length ? trouvees.map(carteRecette) : [pasDeResultat()]));
    majIndicateurs();
  }

  function actualiserTout() { actualiserSaisons(); actualiserOnglets(); actualiserPanneau(); actualiserListe(); }

  function reinitialiser() {
    Object.assign(filtres, FILTRES_PAR_DEFAUT);
    filtres.saisons = null;
    filtres.recherche = "";
    recherche.value = "";
    gardantLeFocus(actualiserTout);
  }

  actualiserPanneauVisible();
  actualiserTout();
  return h("div", {},
    h("h1", { class: "sr-only" }, "Recettes"),
    h("header", { class: "entete" },
      h("a", {
        class: "marque", href: "#/", "data-cle": "accueil", "aria-label": "Accueil : Nos recettes",
        onclick: (e) => { // déjà à l'accueil : on repart d'une liste neuve, en haut de page
          if (window.location.hash && window.location.hash !== "#/") return;
          e.preventDefault();
          filtres.ouvert = false;
          actualiserPanneauVisible();
          reinitialiser();
          window.scrollTo(0, 0);
        },
      }, h("img", { src: "logo.png", alt: "", width: 35, height: 28 }), "Nos recettes"),
      h("div", { class: "boutons-entete" }, boutonFavoris, boutonFiltres)),
    recherche,
    saisonsChoisies,
    compte,
    aide,
    onglets,
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
    const dedans = basculerCourses(recette);
    gardantLeFocus(dessiner);
    annoncer(dedans ? "Ajouté aux courses" : "Retiré des courses", dedans ? { texte: "Voir la liste", href: "#/courses" } : null);
  }

  function basculerFavoriFiche() {
    const liste = basculerFavori([...favoris], id);
    favoris = new Set(liste);
    sauverListe(stockage, CLES.favoris, liste);
    gardantLeFocus(dessiner);
  }

  function dessiner() {
    const personnes = personnesActuelles();
    const mult = facteur(recette, personnes);
    const dansSemaine = Object.hasOwn(semaine, id);
    const nomsIngredients = new Map(donnees.ingredients.map((i) => [i.id, i.nom]));
    // Saison de chaque ingrédient, d'après le calendrier de l'onglet « Saison » (rien pour ceux qui n'y sont pas).
    const moisIngredients = moisParIngredient(donnees.saisonnalite);
    const moisDeSaison = (idIngredient) => {
      const mois = moisIngredients.get(idIngredient);
      if (!mois) return null;
      const ici = mois.includes(moisActuel);
      return h("small", { class: `mois-ing${ici ? " oui" : ""}` }, `${ici ? "De saison" : "Hors saison"} · ${libelleMois(mois)}`);
    };
    const o = recette.origine;
    const livre = o.type === "livre" ? donnees.livres.find((l) => l.id === o.livre) : null;
    const regime = regimeRecette(recette, new Map(donnees.ingredients.map((i) => [i.id, i])));

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
          ligne.precision ? h("small", {}, ` (${ligne.precision})`) : null,
          moisDeSaison(ligne.ingredient)));
    };

    conteneur.replaceChildren(
      h("div", { class: "fiche-tete" },
        h("div", { class: "fiche-photo" },
          photoRecette(recette, true),
          h("button", { type: "button", class: "rond fermer", "data-cle": "fermer-fiche", "aria-label": "Fermer la fiche", onclick: fermerFiche }, icone("croix")),
          h("a", { class: "rond panier", href: "#/courses", "aria-label": `Voir la liste de courses${Object.keys(semaine).length ? ` (${Object.keys(semaine).length} recette${Object.keys(semaine).length > 1 ? "s" : ""})` : ""}` },
            icone("courses"), Object.keys(semaine).length ? h("span", { class: "badge" }, String(Object.keys(semaine).length)) : null),
          h("button", {
            type: "button", class: "rond favori", "data-cle": "favori", "aria-pressed": String(favoris.has(id)),
            "aria-label": favoris.has(id) ? "Retirer des favoris" : "Ajouter aux favoris", onclick: basculerFavoriFiche,
          }, icone("etoile"))),
        h("div", { class: "fiche-titre" },
          h("h1", { class: "titre-recette" }, recette.titre),
          h("p", {}, majuscule(recette.categorie), " · ", recette.saisons.join(", "))),
        h("dl", { class: "infos" },
          o.type === "livre"
            ? ligneInfo("Livre", livre ? livre.titre : o.livre, `, page ${o.page}`)
            : ligneInfo("Source", /^https?:\/\//i.test(o.url) ? h("a", { href: o.url, target: "_blank", rel: "noopener noreferrer" }, o.source) : o.source),
          ligneInfo("Portions",
            `${personnes} personne${personnes > 1 ? "s" : ""}`,
            h("small", { class: "note-livre" },
              `Recette ${o.type === "livre" ? "du livre" : "d'origine"} pour ${recette.personnes} personne${recette.personnes > 1 ? "s" : ""}`,
              recette.personnes_texte ? ` (${recette.personnes_texte})` : "")),
          t && t.preparation ? ligneInfo("Préparation", `${t.preparation} min`) : null,
          t && t.cuisson ? ligneInfo("Cuisson", `${t.cuisson} min`) : null,
          regime !== "non"
            ? ligneInfo("Régime", regime === "vegan" ? "Vegan" : "Végétarien",
              recette.regime ? null : h("small", { class: "note-livre" }, "Déduit des ingrédients, à vérifier sur les produits achetés"))
            : null),
        recette.etapes.length
          ? h("a", { class: "btn alt btn-cuisine", href: `#/cuisine/${encodeURIComponent(id)}` }, "Cuisiner pas à pas")
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
            : null)),
      h("div", { class: "fiche-actions" },
        // Les portions se règlent à côté du bouton d'ajout : c'est le nombre qui sera mis dans la liste de courses.
        h("span", { class: "pas" },
          h("button", { type: "button", "data-cle": "pas-moins", "aria-label": "Moins de personnes", onclick: () => changerPersonnes(-1) }, "−"),
          h("span", { class: "nb" }, compteur, h("small", {}, personnes > 1 ? "pers." : "pers.")),
          h("button", { type: "button", "data-cle": "pas-plus", "aria-label": "Plus de personnes", onclick: () => changerPersonnes(1) }, "+")),
        h("button", { type: "button", "data-cle": "bascule-semaine", class: `btn${dansSemaine ? " alt" : ""}`, onclick: basculerSemaine },
          dansSemaine ? "Retirer des courses" : "Ajouter aux courses")));
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

// ---------- Écran « Courses » : recettes choisies, puis la liste par rayon ----------
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

let recettesOuvertes = true;
// Mode magasin : liste plus grande, articles cochés masqués, écran allumé. Gardé sur le téléphone.
let modeMagasin = chargerListe(stockage, CLES.magasin).includes("oui");

function ecranCourses() {
  const conteneur = h("div");
  const etat = { coches: chargerCoches(stockage), message: "", annulation: null, retiree: null, voirCoches: false };
  const compteurs = new Map(); // un compteur durable par recette, pour que le lecteur d'écran annonce le changement

  function enregistrer() { sauverCoches(stockage, etat.coches); }

  function cocher(cle, coche) {
    if (coche) etat.coches.add(cle); else etat.coches.delete(cle);
    enregistrer();
    etat.message = "";
    etat.annulation = null;
    etat.retiree = null;
    gardantLeFocus(dessiner);
  }

  function toutDecocher() {
    etat.annulation = new Set(etat.coches);
    etat.coches.clear();
    enregistrer();
    etat.message = "Cases décochées.";
    gardantLeFocus(dessiner);
  }

  function annuler() {
    etat.coches = etat.annulation ?? etat.coches;
    etat.annulation = null;
    etat.message = "";
    enregistrer();
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
    etat.annulation = null;
    gardantLeFocus(dessiner);
  }

  function changerPersonnes(recette, delta) {
    const n = Math.max(1, semaine[recette.id] + delta);
    semaine = definirPersonnes(semaine, recette.id, n);
    personnesFiche[recette.id] = n;
    sauverSemaine(stockage, semaine);
    gardantLeFocus(dessiner);
  }

  function retirer(recette) {
    etat.retiree = { id: recette.id, personnes: semaine[recette.id] };
    etat.annulation = null;
    etat.message = "Recette retirée.";
    semaine = basculer(semaine, recette);
    sauverSemaine(stockage, semaine);
    dessinerBarre();
    gardantLeFocus(dessiner);
  }

  function annulerRetrait() {
    const { id, personnes } = etat.retiree;
    etat.retiree = null;
    etat.message = "";
    semaine = { ...semaine, [id]: personnes };
    sauverSemaine(stockage, semaine);
    dessinerBarre();
    gardantLeFocus(dessiner);
  }

  function ligneRecette(recette) {
    if (!compteurs.has(recette.id)) compteurs.set(recette.id, h("b", { "aria-live": "polite" }));
    const compteur = compteurs.get(recette.id);
    compteur.textContent = String(semaine[recette.id]);
    return h("div", { class: "rec-ligne" },
      h("a", { href: lienRecette(recette.id) }, recette.titre),
      h("span", { class: "pas pas-compact" },
        h("button", { type: "button", "data-cle": `pas-moins-${recette.id}`, "aria-label": `Moins de personnes pour ${recette.titre}`, onclick: () => changerPersonnes(recette, -1) }, "−"),
        compteur,
        h("button", { type: "button", "data-cle": `pas-plus-${recette.id}`, "aria-label": `Plus de personnes pour ${recette.titre}`, onclick: () => changerPersonnes(recette, 1) }, "+")),
      h("button", { type: "button", class: "rond", "data-cle": `retirer-${recette.id}`, "aria-label": `Retirer ${recette.titre} des courses`, onclick: () => retirer(recette) }, icone("croix")));
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
        item.melange ? h("small", { class: "origine" }, item.recettes.join(" · ")) : null));
  }

  function basculerMagasin() {
    modeMagasin = !modeMagasin;
    sauverListe(stockage, CLES.magasin, modeMagasin ? ["oui"] : []);
    etat.voirCoches = false;
    garderEcranAllume(modeMagasin);
    gardantLeFocus(dessiner);
    window.scrollTo(0, 0);
  }

  // Les articles pas encore cochés d'abord, les cochés en bas.
  const nonCochesAvant = (items) => [...items.filter((i) => !etat.coches.has(i.cle)), ...items.filter((i) => etat.coches.has(i.cle))];

  function dessiner() {
    const liste = compilerCourses(donnees.recettes, donnees.ingredients, semaine);
    const tous = [...liste.groupes.flatMap((g) => g.items), ...liste.placard];
    const restants = tous.filter((i) => !etat.coches.has(i.cle)).length;
    if (!liste.recettes) {
      conteneur.replaceChildren(
        h("h1", {}, "Courses"),
        h("div", { class: "vide" },
          "La liste est vide. Touchez « + » sur une recette, ou « Ajouter aux courses » dans sa fiche.",
          etat.retiree ? h("button", { type: "button", class: "lien-texte", "data-cle": "annuler", onclick: annulerRetrait }, "Annuler le dernier retrait") : null,
          h("a", { class: "lien-action", href: "#/" }, "Voir les recettes")));
      return;
    }
    const choisies = Object.keys(semaine).map((id) => donnees.recettes.find((r) => r.id === id)).filter(Boolean);
    conteneur.classList.toggle("magasin", modeMagasin);
    // En mode magasin, on ne montre que ce qu'il reste à acheter (sauf si on demande à revoir les cochés).
    const masquerCoches = modeMagasin && !etat.voirCoches;
    const montrer = (items) => (masquerCoches ? items.filter((i) => !etat.coches.has(i.cle)) : nonCochesAvant(items));
    const groupes = liste.groupes.map((g) => ({ titre: g.titre, items: montrer(g.items) })).filter((g) => g.items.length > 0);
    const placard = montrer(liste.placard);
    const nbCoches = tous.length - restants;
    conteneur.replaceChildren(...[
      h("h1", {}, "Courses"),
      h("p", { class: "sub" }, `${restants} article${restants > 1 ? "s" : ""} à acheter sur ${tous.length}`),
      h("button", {
        type: "button", class: `btn bascule-magasin${modeMagasin ? "" : " alt"}`, "data-cle": "magasin", "aria-pressed": String(modeMagasin), onclick: basculerMagasin,
      }, modeMagasin ? "Quitter le mode magasin" : "Mode magasin"),
      modeMagasin ? null : h("details", { class: "recettes-choisies", open: recettesOuvertes, ontoggle: (e) => { recettesOuvertes = e.target.open; } },
        h("summary", {}, `Recettes choisies (${choisies.length})`),
        choisies.map(ligneRecette)),
      modeMagasin ? null : h("div", { class: "actions" },
        h("button", { type: "button", class: "lien-action", "data-cle": "copier", onclick: () => copier(liste) }, "Copier la liste"),
        h("button", { type: "button", class: "lien-action", "data-cle": "decocher", onclick: toutDecocher }, "Tout décocher")),
      h("p", { class: "sub statut", role: "status" }, etat.message,
        etat.annulation ? h("button", { type: "button", class: "lien-texte", "data-cle": "annuler", onclick: annuler }, "Annuler") : null,
        etat.retiree ? h("button", { type: "button", class: "lien-texte", "data-cle": "annuler", onclick: annulerRetrait }, "Annuler") : null),
      masquerCoches && restants === 0 ? h("div", { class: "vide" }, "Tout est dans le panier.") : null,
      ...groupes.map((g) => h("section", {}, h("h2", { class: "section" }, g.titre), g.items.map(ligne))),
      placard.length ? h("section", {}, h("h2", { class: "section" }, "À vérifier au placard"), placard.map(ligne)) : null,
      modeMagasin && nbCoches > 0
        ? h("button", { type: "button", class: "lien-action voir-coches", "data-cle": "voir-coches", onclick: () => { etat.voirCoches = !etat.voirCoches; gardantLeFocus(dessiner); } },
          etat.voirCoches ? "Masquer les articles cochés" : `Revoir les ${nbCoches} article${nbCoches > 1 ? "s" : ""} coché${nbCoches > 1 ? "s" : ""}`)
        : null].filter(Boolean));
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
  const sites = recettesWebParSite(recettes);
  if (sites.length) {
    cartes.push(h("section", { class: "card" },
      h("h2", {}, "Internet"),
      sites.map((s) => h("div", { class: "site-web" },
        h("h3", {}, s.site),
        s.recettes.map((r) => h("a", { class: "livre-ligne", href: lienRecette(r.id) }, h("span", {}, r.titre)))))));
  }
  return h("div", {},
    h("h1", {}, "Livres"),
    h("p", { class: "sub" }, `${livres.length} livre${livres.length > 1 ? "s" : ""} · retrouvez la page`),
    h("div", { class: "stack" }, cartes));
}

// ---------- Écran « Saison » : roue des mois, aliments de saison ----------
const EMOJI_SAISON = { printemps: "🌱", été: "☀️", automne: "🍂", hiver: "❄️" };
const LETTRES_MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const INITIALES_MOIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MOIS_MILIEU = { printemps: 4, été: 7, automne: 10, hiver: 1 }; // mois sur lequel la roue se place quand on choisit une saison
const moisActuel = new Date().getMonth() + 1;
// État gardé pendant la session : mois choisi, saison entière (null = un seul mois), recherche, aliment ouvert.
const calendrier = { mois: moisActuel, saison: null, recherche: "", ouvert: null };
let rotationRoue = -(moisActuel - 1) * 30; // degrés cumulés : la roue tourne par le chemin le plus court
let fermerFeuilleCourante = null;

const normaliserAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
function viserMois(mois) {
  rotationRoue += normaliserAngle(-(mois - 1) * 30 - rotationRoue);
}
const moisSousLaFleche = (rot) => ((((Math.round(-rot / 30) % 12) + 12) % 12) + 1);
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const variableSaison = (mois) => `var(--s-${saisonDuMoisNumero(mois) === "été" ? "ete" : saisonDuMoisNumero(mois)})`;

function ecranCalendrier() {
  const aliments = donnees.saisonnalite;
  const conteneur = h("div", {});

  // --- la roue ---
  const centreEmoji = h("span", { class: "centre-emoji", "aria-hidden": "true" });
  const centreNom = h("span", { class: "centre-nom" });
  const centreDetail = h("span", { class: "centre-detail" });
  const centre = h("div", { class: "roue-centre", "aria-live": "polite" }, centreEmoji, centreNom, centreDetail);
  const roue = h("div", { class: "roue", role: "group", "aria-label": "Roue des mois : faites-la tourner ou touchez un mois" },
    LETTRES_MOIS.map((lettres, i) =>
      h("button", {
        type: "button", class: `roue-mois${i + 1 === moisActuel ? " ici" : ""}`, style: `--a:${i * 30}`,
        "data-cle": `roue-${i + 1}`, "aria-label": NOMS_MOIS[i], onclick: () => choisirMois(i + 1),
      }, lettres)));
  const zone = h("div", { class: "roue-zone" }, h("span", { class: "roue-fleche", "aria-hidden": "true" }), roue, centre);
  roue.style.setProperty("--rot", String(rotationRoue));

  function fondRoue() {
    const couleurs = [], voile = [];
    for (let k = 1; k <= 12; k += 1) {
      const a = (k - 1) * 30, b = k * 30;
      couleurs.push(`${variableSaison(k)} ${a}deg ${b}deg`);
      const estompe = calendrier.saison && saisonDuMoisNumero(k) !== calendrier.saison;
      voile.push(`${estompe ? "rgba(255,255,255,.7)" : "transparent"} ${a}deg ${b}deg`);
    }
    return `repeating-conic-gradient(from -15deg, #fff 0 1.2deg, transparent 1.2deg 30deg), conic-gradient(from -15deg, ${voile.join(", ")}), conic-gradient(from -15deg, ${couleurs.join(", ")})`;
  }

  function majCentre(mois) {
    const saison = calendrier.saison ?? saisonDuMoisNumero(mois);
    centreEmoji.textContent = EMOJI_SAISON[saison];
    if (calendrier.saison) {
      const liste = alimentsDeLaSaison(aliments, calendrier.saison);
      centreNom.textContent = majuscule(calendrier.saison);
      centreDetail.textContent = `${libelleMois(MOIS_DE_SAISON[calendrier.saison])} · ${liste.length} aliments`;
    } else {
      centreNom.textContent = majuscule(NOMS_MOIS[mois - 1]);
      const l = alimentsDuMois(aliments, mois, "legume").length, f = alimentsDuMois(aliments, mois, "fruit").length;
      centreDetail.textContent = `${pluriel(l, "légume")} · ${pluriel(f, "fruit")}`;
    }
  }

  // Après un choix de mois ou de saison, la page descend toute seule vers les listes (après un court instant pour voir la roue tourner).
  function descendreAuxAliments() {
    setTimeout(() => {
      const doux = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      listes.scrollIntoView({ behavior: doux ? "smooth" : "auto", block: "start" });
    }, 350);
  }
  function tournerVers(mois) {
    viserMois(mois);
    roue.style.setProperty("--rot", String(rotationRoue));
  }
  function choisirMois(mois) {
    calendrier.mois = mois;
    calendrier.saison = null;
    calendrier.recherche = "";
    recherche.value = "";
    tournerVers(mois);
    rafraichir();
    descendreAuxAliments();
  }
  function choisirSaison(saison) {
    if (calendrier.saison === saison) { calendrier.saison = null; rafraichir(); descendreAuxAliments(); return; }
    calendrier.saison = saison;
    calendrier.recherche = "";
    recherche.value = "";
    calendrier.mois = MOIS_MILIEU[saison];
    tournerVers(calendrier.mois);
    rafraichir();
    descendreAuxAliments();
  }

  // Glisser la roue du doigt : elle suit, puis se cale sur le mois le plus proche.
  let glisse = null;
  let ignorerClic = false;
  const angleDe = (e, c) => (Math.atan2(e.clientX - c.x, -(e.clientY - c.y)) * 180) / Math.PI;
  roue.addEventListener("pointerdown", (e) => {
    const r = roue.getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    glisse = { id: e.pointerId, c, dernier: angleDe(e, c), cumul: 0, depart: rotationRoue, bouge: false };
  });
  roue.addEventListener("pointermove", (e) => {
    if (!glisse || e.pointerId !== glisse.id) return;
    const a = angleDe(e, glisse.c);
    glisse.cumul += normaliserAngle(a - glisse.dernier);
    glisse.dernier = a;
    if (!glisse.bouge) {
      if (Math.abs(glisse.cumul) < 5) return;
      glisse.bouge = true;
      roue.setPointerCapture(e.pointerId);
      roue.classList.add("glisse");
    }
    rotationRoue = glisse.depart + glisse.cumul;
    roue.style.setProperty("--rot", String(rotationRoue));
    if (!calendrier.saison) majCentre(moisSousLaFleche(rotationRoue));
  });
  const finGlisse = (e) => {
    if (!glisse || e.pointerId !== glisse.id) return;
    const aBouge = glisse.bouge;
    glisse = null;
    if (!aBouge) return;
    ignorerClic = true;
    setTimeout(() => { ignorerClic = false; }, 0);
    roue.classList.remove("glisse");
    calendrier.mois = moisSousLaFleche(rotationRoue);
    calendrier.saison = null;
    calendrier.recherche = "";
    recherche.value = "";
    tournerVers(calendrier.mois);
    rafraichir();
    descendreAuxAliments();
  };
  roue.addEventListener("pointerup", finGlisse);
  roue.addEventListener("pointercancel", finGlisse);
  roue.addEventListener("click", (e) => { if (ignorerClic) { e.stopPropagation(); e.preventDefault(); } }, true);

  // --- saisons, mois, recherche ---
  const boutonsSaison = h("div", { class: "saison-boutons", role: "group", "aria-label": "Saisons" });
  const chipsMois = h("div", { class: "puces", role: "group", "aria-label": "Mois" });
  const retour = h("button", { type: "button", class: "lien-action retour-mois", "data-cle": "ce-mois", onclick: () => choisirMois(moisActuel) }, "Revenir à ce mois-ci");
  const recherche = h("input", {
    type: "search", class: "recherche", placeholder: "Chercher un aliment, toute l'année", "aria-label": "Chercher un aliment",
    autocomplete: "off", value: calendrier.recherche,
    oninput: (e) => { calendrier.recherche = e.target.value; rafraichirListes(); },
  });
  const listes = h("div", { class: "aliments" });
  const feuille = h("div", {});

  function pastille(a, i, avecMois) {
    const moisIci = a.moisDeLaSaison;
    return h("button", {
      type: "button", class: "aliment", style: `--i:${Math.min(i, 40)}`, "data-cle": `aliment-${a.id}`,
      "aria-haspopup": "dialog", onclick: () => ouvrirFeuille(a.id),
    },
      a.emoji ? h("span", { class: "emo", "aria-hidden": "true" }, a.emoji) : null,
      h("span", { class: "nom-al" }, a.nom),
      moisIci
        ? h("span", { class: "points", title: moisIci.map((m) => NOMS_MOIS[m - 1]).join(", ") },
            MOIS_DE_SAISON[calendrier.saison].map((m) => h("i", { class: moisIci.includes(m) ? "on" : "" })))
        : null,
      avecMois ? h("small", { class: "mois-al" }, libelleMois(a.mois)) : null);
  }
  function section(titre, liste, avecMois = false) {
    if (liste.length === 0) return null;
    return h("section", {},
      h("h2", { class: "section" }, titre, h("span", { class: "compte" }, String(liste.length))),
      h("div", { class: "pastilles" }, liste.map((a, i) => pastille(a, i, avecMois))));
  }
  function rafraichirListes() {
    const texte = calendrier.recherche.trim();
    if (texte) {
      const trouves = chercherAliments(aliments, texte);
      listes.replaceChildren(
        trouves.length
          ? section(`Résultats pour « ${texte} »`, trouves, true)
          : h("p", { class: "vide" }, `Aucun aliment ne correspond à « ${texte} ».`));
      return;
    }
    const liste = (type) => (calendrier.saison ? alimentsDeLaSaison(aliments, calendrier.saison, type) : alimentsDuMois(aliments, calendrier.mois, type));
    listes.replaceChildren(
      section("Légumes, herbes et champignons", liste("legume")),
      section("Fruits et fruits secs", liste("fruit")));
  }
  function rafraichir() {
    gardantLeFocus(() => {
      roue.style.background = fondRoue();
      majCentre(calendrier.mois);
      roue.querySelectorAll(".roue-mois").forEach((b, i) => {
        const dansSaison = calendrier.saison ? MOIS_DE_SAISON[calendrier.saison].includes(i + 1) : i + 1 === calendrier.mois;
        b.setAttribute("aria-pressed", String(dansSaison));
      });
      boutonsSaison.replaceChildren(...Object.keys(MOIS_DE_SAISON).map((s) =>
        h("button", { type: "button", class: "saison-btn", "data-saison": s, "data-cle": `saison-${s}`, "aria-pressed": String(calendrier.saison === s), onclick: () => choisirSaison(s) },
          h("span", { "aria-hidden": "true" }, EMOJI_SAISON[s]), majuscule(s))));
      chipsMois.replaceChildren(...NOMS_MOIS.map((nom, i) =>
        h("button", { type: "button", class: "puce", "data-cle": `mois-${i + 1}`, "aria-pressed": String(!calendrier.saison && calendrier.mois === i + 1), onclick: () => choisirMois(i + 1) }, majuscule(nom))));
      retour.hidden = !calendrier.saison && calendrier.mois === moisActuel;
      rafraichirListes();
    });
  }

  // --- fiche d'un aliment (fenêtre en bas de l'écran) ---
  function ouvrirFeuille(id) {
    const a = aliments.find((x) => x.id === id);
    if (!a) return;
    calendrier.ouvert = id;
    const attente = moisAvantSaison(a.mois, moisActuel);
    const statut = attente === 0
      ? "De saison en ce moment"
      : `Pas de saison en ${NOMS_MOIS[moisActuel - 1]} · de retour ${attente === 1 ? "le mois prochain" : `dans ${attente} mois`}`;
    const recettesLiees = recettesAvecAliment(donnees.recettes, a);
    const fermer = () => {
      calendrier.ouvert = null;
      feuille.replaceChildren();
      fermerFeuilleCourante = null;
      vue.querySelector(`[data-cle="aliment-${CSS.escape(id)}"]`)?.focus();
    };
    fermerFeuilleCourante = fermer;
    const bouton = h("button", { type: "button", class: "rond fermer-feuille", "aria-label": "Fermer", onclick: fermer }, icone("croix"));
    feuille.replaceChildren(
      h("div", { class: "feuille-fond", onclick: fermer }),
      h("div", { class: "feuille", role: "dialog", "aria-modal": "true", "aria-label": a.nom },
        bouton,
        h("div", { class: "feuille-tete" },
          a.emoji ? h("span", { class: "feuille-emoji", "aria-hidden": "true" }, a.emoji) : null,
          h("div", {},
            h("h2", {}, a.nom),
            h("p", { class: "sub" }, a.type === "fruit" ? "Fruit" : "Légume, herbe ou champignon", " · ", libelleMois(a.mois)))),
        h("div", { class: "frise", role: "img", "aria-label": `Mois de saison : ${a.mois.map((m) => NOMS_MOIS[m - 1]).join(", ")}` },
          INITIALES_MOIS.map((lettre, i) =>
            h("span", { class: `${a.mois.includes(i + 1) ? "on" : ""}${i + 1 === moisActuel ? " ici" : ""}`, style: `--c:${variableSaison(i + 1)}` }, lettre))),
        h("p", { class: `statut${attente === 0 ? " oui" : ""}` }, statut),
        h("h3", {}, "Dans vos recettes"),
        recettesLiees.length
          ? h("div", {},
              recettesLiees.slice(0, 8).map((r) => h("a", { class: "livre-ligne", href: lienRecette(r.id) }, h("span", {}, r.titre), h("span", { class: "qte" }, tempsTotal(r)))),
              recettesLiees.length > 8 ? h("p", { class: "sub" }, `et ${recettesLiees.length - 8} autres`) : null)
          : h("p", { class: "sub" }, (a.ingredients ?? []).length ? "Aucune recette du site n'en contient pour le moment." : "Pas encore d'ingrédient du site lié à cet aliment.")));
    bouton.focus();
  }

  conteneur.append(
    h("h1", {}, "Saison"),
    h("p", { class: "sub" }, "Les fruits et légumes de chaque mois. Tournez la roue ou choisissez une saison."),
    boutonsSaison,
    zone,
    chipsMois,
    retour,
    recherche,
    listes,
    feuille);
  rafraichir();
  if (calendrier.ouvert) ouvrirFeuille(calendrier.ouvert);
  return conteneur;
}

// ---------- Affichage ----------
function afficher() {
  if (!donnees) return;
  const route = lireRoute(window.location.hash);
  const ecrans = {
    saison: ecranSaison,
    semaine: ecranCourses, // ancien nom de l'écran, gardé pour les liens déjà enregistrés
    courses: ecranCourses,
    livres: ecranLivres,
    calendrier: ecranCalendrier,
    recette: () => ecranRecette(route.id),
    cuisine: () => ecranCuisine(route.id),
  };
  noterRang();
  cacherMessage();
  fermerFeuilleCourante = null; // la fenêtre d'un aliment ne suit pas d'un écran à l'autre
  dessinerBarre(route.nom === "recette" || route.nom === "cuisine" ? "saison" : route.nom === "semaine" ? "courses" : route.nom);
  barre.closest(".barre").hidden = route.nom === "cuisine" || route.nom === "recette"; // ces écrans ont leurs propres boutons en bas
  garderEcranAllume(route.nom === "recette" || route.nom === "cuisine" || ((route.nom === "courses" || route.nom === "semaine") && modeMagasin));
  vue.className = "app" + (route.nom === "saison" ? " large" : route.nom === "recette" ? " fiche-large" : "");
  vue.replaceChildren(ecrans[route.nom]());
  window.scrollTo(0, 0);
  hashAvant = window.location.hash || "#/";
}

async function lireJson(chemin) {
  const reponse = await fetch(chemin);
  if (!reponse.ok) throw new Error(`${chemin} : ${reponse.status}`);
  return reponse.json();
}

async function demarrer() {
  dessinerBarre("saison");
  try {
    const [recettes, ingredients, livres, saisonnalite] = await Promise.all([
      lireJson("data/recettes.json"),
      lireJson("data/ingredients.json"),
      lireJson("data/livres.json"),
      lireJson("data/saisonnalite.json").catch(() => []), // sans le calendrier, le reste du site marche
    ]);
    donnees = { recettes, ingredients, livres, saisonnalite };
    semaine = chargerSemaine(stockage, recettes);
  } catch {
    vue.replaceChildren(messageErreur("Impossible de charger les recettes"));
    return;
  }
  window.addEventListener("hashchange", afficher);
  // Comme une fenêtre qui s'ouvre sur la liste : un clic à côté de la fiche (hors page) ou la touche Échap la ferme.
  document.addEventListener("click", (e) => {
    const cible = e.target;
    if ((cible === document.documentElement || cible === document.body) && lireRoute(window.location.hash).nom === "recette") fermerFiche();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (fermerFeuilleCourante) fermerFeuilleCourante();
    else if (lireRoute(window.location.hash).nom === "recette") fermerFiche();
  });
  afficher();
}

demarrer();
