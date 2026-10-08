# Compilation des recettes — Étape 1 « Socle » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une appli installable (3 onglets : De saison, Ma semaine, Livres + fiche recette) alimentée par des fichiers de données validés automatiquement, avec les premières recettes du livre « La flemme ».

**Architecture:** Site statique sans build ni dépendance : `index.html` charge `src/app.js` (DOM) qui s'appuie sur des modules purs testables (`schema.js`, `lib.js`, `semaine.js`, `routes.js`). Les données sont 4 fichiers JSON dans `data/`, contrôlés par `scripts/validate-data.mjs`. L'état « Ma semaine » est local à chaque téléphone (localStorage).

**Tech Stack:** HTML/CSS/JavaScript (modules ES), Node 22 (`node --test`, aucune dépendance npm), serveur local `python -m http.server` pour les tests visuels.

**Spec:** `docs/superpowers/specs/2026-10-08-compilation-des-recettes-design.md`

## Global Constraints

- Nom : « Compilation des recettes ». Interface en français.
- Pas de serveur, pas de compte, pas de hors-ligne (aucun service worker), aucune donnée personnelle dans le site.
- **Nombre de personnes obligatoire** pour chaque recette (entier ≥ 1) ; refusé par la validation s'il manque.
- Saisons : printemps, été, automne, hiver. Catégories : entrée, plat. Look : cartes claires, polices système, titres de recette en Georgia, accent vert herbe (couleur à valider), thème clair et sombre.
- Chaque recette a une origine : livre + page, ou internet + lien.
- Contrôles avant chaque commit de données : `node --test tests/` et `node scripts/validate-data.mjs`.
- Test sur mobile (375 px) et ordinateur, console sans erreur, avant de déclarer terminé.
- Commits : message en français ; terminer par la ligne `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Aucune création GitHub avant la tâche 8 et l'accord explicite de Loïc.

## Review Focus

1. Recette sans nombre de personnes (absent, 0, négatif, 2,5, texte) → la validation la refuse (tâche 1).
2. Recherche « echalote » doit trouver « échalote », « OEUF » doit trouver « œuf » ; casse et accents ignorés (tâche 2).
3. Ligne d'ingrédient qui référence un ingrédient absent du référentiel → refusée (tâche 1).
4. localStorage absent, qui lève une erreur ou contient du texte illisible (navigation privée iPhone) → l'appli démarre avec une semaine vide, sans erreur (tâche 3).
5. Une recette enregistrée dans « Ma semaine » puis supprimée des données → ignorée sans erreur (tâche 3).

---

## File Structure

| Fichier | Rôle |
|---|---|
| `package.json` | `"type": "module"`, script `test` |
| `src/schema.js` | Listes de valeurs autorisées (saisons, catégories, rayons, unités) |
| `src/lib.js` | Fonctions pures : normalisation, saisons, filtres, quantités |
| `src/semaine.js` | État « Ma semaine » (pur, stockage injecté) |
| `src/routes.js` | Lecture de l'adresse `#/…` |
| `src/app.js` | Affichage et événements (DOM) |
| `src/style.css`, `index.html`, `manifest.json`, `icon-*.png` | Interface et installation sur l'écran d'accueil |
| `data/livres.json`, `ingredients.json`, `recettes.json`, `journal.json` | Les tables |
| `scripts/validate-data.mjs` | Contrôle des données (CLI + fonction) |
| `scripts/make-icons.mjs`, `scripts/heic-vers-jpeg.ps1` | Icônes ; conversion des photos iPhone |
| `tests/*.test.mjs` | Tests |

---

### Task 1: Données et validation

**Files:**
- Create: `package.json`, `src/schema.js`, `scripts/validate-data.mjs`, `tests/validate-data.test.mjs`, `data/livres.json`, `data/ingredients.json`, `data/recettes.json`, `data/journal.json`, `.gitignore`
- Initialise : `git init` dans le dossier du projet

**Interfaces:**
- Produces: `src/schema.js` exporte `SAISONS`, `CATEGORIES`, `RAYONS`, `UNITES` (tableaux de chaînes ; valeurs exactes ci-dessous).
- Produces: `validerDonnees({livres, ingredients, recettes, journal}) -> string[]` dans `scripts/validate-data.mjs` (liste vide = données valides ; chaque message commence par le chemin, ex. `recettes[0].personnes: …`). Le fichier, lancé en ligne de commande, lit `data/*.json`, affiche `OK : N recettes` et sort avec le code 0, sinon affiche les erreurs et sort avec le code 1.
- Forme des données :
  - livre `{id, titre, auteur}` (auteur peut être `null`)
  - ingrédient `{id, nom, rayon, saisons}` (`saisons: []` = toute l'année)
  - recette `{id, titre, origine, saisons, categorie, type, personnes, personnes_texte, temps:{preparation, cuisson}, ingredients:[{ingredient, quantite, unite, precision}], etapes, notes, photo}` ; `origine` = `{type:"livre", livre, page}` ou `{type:"web", source, url}` ; `personnes_texte`, `precision`, `photo` peuvent être `null` ; `temps.*` entier ≥ 0 ou `null`
  - journal `{livre, page, date, etat, recette}` (`etat` ∈ `brouillon`, `validé`)
- Valeurs : `SAISONS=["printemps","été","automne","hiver"]`, `CATEGORIES=["entrée","plat"]`, `RAYONS=["Légumes","Fruits","Herbes","Crèmerie","Boucherie","Poissonnerie","Épicerie","Boulangerie","Surgelés","Autre"]`, `UNITES=["g","kg","ml","cl","l","c. à soupe","c. à café","pièce","bouquet","gousse","pincée","boîte"]`.

- [ ] **Step 1: Écrire les tests qui échouent** dans `tests/validate-data.test.mjs`, avec un jeu valide `jeuValide()` (1 livre, 3 ingrédients, 1 recette, journal vide) puis :
  - `jeuValide()` → `validerDonnees` renvoie `[]`
  - `personnes` valant `0`, `-1`, `2.5`, `"2"` et absent → chaque fois un message contenant `personnes`
  - ingrédient de recette inexistant (`"inconnu"`) → un message contenant `inconnu`
  - `quantite: null` avec `unite: "g"` → un message ; `quantite: null` avec `unite: null` → aucune erreur (cas « sel, poivre »)
  - `unite: "tasse"` → un message ; `rayon: "Cave"` → un message
  - `categorie: "dessert"` → un message ; `saisons: []` sur une recette → un message
  - origine livre avec `livre: "absent"` → un message ; origine web avec `url: "http://x"` → un message (https obligatoire)
  - deux recettes même `id` → un message ; deux recettes même livre + même page + même titre → un message ; même livre + même page + titres différents → aucune erreur
  - `etapes: []` → un message ; journal qui référence une recette inexistante → un message
- [ ] **Step 2: Lancer** `node --test tests/validate-data.test.mjs` — attendu : échec (module absent).
- [ ] **Step 3: Implémenter** `src/schema.js`, `validerDonnees` et le mode ligne de commande dans `scripts/validate-data.mjs` (fonction exportée, CLI exécutée seulement si le fichier est lancé directement).
- [ ] **Step 4: Remplir les données de départ** : `livres.json` avec `{id:"la-flemme", titre:"La flemme", auteur:null}` ; `ingredients.json` avec lentilles cuites (Épicerie), carotte (Légumes), feta (Crèmerie), échalote (Légumes), persil (Herbes), menthe (Herbes), noix de pécan (Épicerie), tous `saisons: []` sauf mention contraire à valider avec Loïc ; `recettes.json` avec la *Salade de lentilles, carottes et feta* : livre `la-flemme`, page 22, saisons `["hiver"]`, catégorie `plat`, type `salade`, personnes 2, temps préparation 8 / cuisson 2, 10 lignes d'ingrédients (200 g lentilles cuites « en bocal ou en conserve » ; 3 pièce carotte ; 100 g feta ; 1 pièce échalote ; 0,5 bouquet persil ; 0,5 bouquet menthe ; 2 c. à soupe noix de pécan ; sel et poivre `quantite: null`), 6 étapes (texte du livre), notes : astuce lentilles, « Vinaigrette : 2 c. à soupe de vinaigrette au tahini (p. 18) », « Topping : 1 c. à soupe de pickles d'oignon rouge (p. 15) » ; `journal.json` avec l'entrée livre/page 22, état `brouillon` jusqu'à validation de Loïc.
- [ ] **Step 5: Lancer** `node --test tests/ && node scripts/validate-data.mjs` — attendu : tests verts, `OK : 1 recettes`.
- [ ] **Step 6: Commit** : `git init`, puis `git add -A && git commit -m "Données de départ et validation"`.

---

### Task 2: Logique pure (filtres, saisons, quantités)

**Files:**
- Create: `src/lib.js`, `tests/lib.test.mjs`

**Interfaces:**
- Consumes: `SAISONS` de `src/schema.js` ; forme des recettes et ingrédients de la tâche 1.
- Produces (tous exportés par `src/lib.js`) :
  - `normaliser(texte: string) -> string` : minuscules, sans accents, `œ`→`oe`, `æ`→`ae`, espaces coupés
  - `saisonDuMois(date: Date) -> "printemps"|"été"|"automne"|"hiver"` : mars–mai printemps, juin–août été, septembre–novembre automne, décembre–février hiver
  - `saisonsDeduites(recette, ingredients) -> string[]` : saisons communes à tous les ingrédients qui ont des saisons non vides ; `SAISONS` entier si aucun ingrédient n'a de saison ; `[]` si aucune saison commune
  - `filtrerRecettes(recettes, ingredients, {saison?, categorie?, type?, recherche?}) -> recette[]` : filtres combinés en « et » ; `recherche` compare titre et noms d'ingrédients normalisés (sous-chaîne) ; résultat trié par titre normalisé
  - `typesDisponibles(recettes) -> string[]` : types uniques triés
  - `facteur(recette, personnes: number) -> number` = `personnes / recette.personnes`
  - `quantiteAjustee(quantite: number|null, facteur: number) -> number|null` : `null` reste `null`, sinon arrondi à 2 décimales
  - `formaterQuantite(quantite: number|null, unite: string|null) -> string`

- [ ] **Step 1: Écrire les tests qui échouent** (`tests/lib.test.mjs`) :
  - `normaliser("Échalote ")==="echalote"`, `normaliser("ŒUF")==="oeuf"`
  - `saisonDuMois(new Date(2026,9,8))==="automne"`, `new Date(2026,11,1)` → `hiver`, `new Date(2026,2,1)` → `printemps`, `new Date(2026,7,31)` → `été`
  - `saisonsDeduites` : courge `["automne","hiver"]` + oignon `[]` → `["automne","hiver"]` ; courge + tomate `["été"]` → `[]` ; oignon seul → les 4 saisons
  - `filtrerRecettes` : recherche `"echalote"` trouve la salade de lentilles ; recherche `"QUICHE"` trouve une recette dont le titre contient « quiche » ; `saison:"été"` exclut une recette `["hiver"]` ; liste vide quand rien ne correspond ; ordre alphabétique
  - `facteur({personnes:2}, 4)===2` ; `quantiteAjustee(3, 0.5)===1.5` ; `quantiteAjustee(null, 2)===null` ; `quantiteAjustee(1, 1/3)===0.33`
  - `formaterQuantite(200,"g")==="200 g"`, `(0.5,"bouquet")==="0,5 bouquet"`, `(3,"pièce")==="3"`, `(null,null)==="au goût"`, `(2,"c. à soupe")==="2 c. à soupe"`, `(1.333,"cl")==="1,33 cl"`
- [ ] **Step 2: Lancer** `node --test tests/lib.test.mjs` — attendu : échec.
- [ ] **Step 3: Implémenter** les fonctions de l'Interface dans `src/lib.js`.
- [ ] **Step 4: Lancer** `node --test tests/` — attendu : tout vert.
- [ ] **Step 5: Commit** : `git add -A && git commit -m "Logique pure : filtres, saisons, quantités"`.

---

### Task 3: État « Ma semaine » et routes

**Files:**
- Create: `src/semaine.js`, `src/routes.js`, `tests/semaine.test.mjs`, `tests/routes.test.mjs`

**Interfaces:**
- Produces (`src/semaine.js`) : la semaine est un objet `{ [idRecette]: personnes }`.
  - `chargerSemaine(storage, recettes) -> object` : lit la clé `compilation-recettes.semaine` ; renvoie `{}` si le stockage est absent, lève une erreur, ou contient un JSON illisible ou qui n'est pas un objet ; supprime les ids absents de `recettes` et les valeurs qui ne sont pas des entiers ≥ 1
  - `sauverSemaine(storage, semaine) -> void` : ne lève jamais d'erreur
  - `basculer(semaine, recette) -> object` : ajoute la recette avec `recette.personnes`, ou la retire ; ne modifie pas l'objet reçu
  - `definirPersonnes(semaine, id, n: number) -> object` : entier ≥ 1 (arrondi, minimum 1) ; ignore un id absent de la semaine
- Produces (`src/routes.js`) : `lireRoute(hash: string) -> {nom: "saison"|"semaine"|"livres"|"recette", id?: string}` ; `#/semaine`, `#/livres`, `#/recette/<id>` ; tout le reste (vide, inconnu) → `{nom:"saison"}`.

- [ ] **Step 1: Écrire les tests qui échouent** :
  - `chargerSemaine` avec un faux stockage : vide → `{}` ; JSON `"{oups"` → `{}` ; stockage dont `getItem` lève une erreur → `{}` ; `storage` valant `undefined` → `{}` ; `{"a":2,"zzz":3,"b":0,"c":1.5}` avec recettes `a`,`b`,`c` → `{a:2}`
  - `sauverSemaine` avec un stockage dont `setItem` lève → ne lève pas ; avec un stockage normal → relisible par `chargerSemaine`
  - `basculer` ajoute avec `personnes` de la recette puis retire ; l'objet d'origine n'est pas modifié
  - `definirPersonnes(s,"a",0)` → 1 ; `(s,"a",3.6)` → 4 ; `(s,"absent",3)` → inchangé
  - `lireRoute("#/recette/salade-x")` → `{nom:"recette",id:"salade-x"}` ; `""`, `"#/n-importe-quoi"`, `"#/recette/"` → `{nom:"saison"}`
- [ ] **Step 2: Lancer** `node --test tests/` — attendu : échec.
- [ ] **Step 3: Implémenter** `src/semaine.js` et `src/routes.js` selon les Interfaces.
- [ ] **Step 4: Lancer** `node --test tests/` — attendu : tout vert.
- [ ] **Step 5: Commit** : `git add -A && git commit -m "Ma semaine (état) et routes"`.

---

### Task 4: Interface — De saison, Fiche, Livres

**Files:**
- Create: `index.html`, `src/style.css`, `src/app.js`

**Interfaces:**
- Consumes: `filtrerRecettes`, `typesDisponibles`, `saisonDuMois`, `facteur`, `quantiteAjustee`, `formaterQuantite` (`src/lib.js`) ; `chargerSemaine`, `sauverSemaine`, `basculer` (`src/semaine.js`) ; `lireRoute` (`src/routes.js`).
- Produces: `src/app.js` charge `data/*.json` avec `fetch`, affiche l'écran selon `lireRoute(location.hash)` et se réaffiche au changement d'adresse ; une erreur de chargement des données affiche un message clair (« Impossible de charger les recettes ») au lieu d'une page vide. Barre de navigation en bas : De saison, Ma semaine, Livres (pas d'onglet Courses avant l'étape 2).

- [ ] **Step 1: Écrire `index.html` et `src/style.css`** : mêmes codes que la maquette https://claude.ai/artifact/42uxjPofRRnUfaxonmMgFi (jetons de couleur, thème clair et sombre, titres de recette en Georgia, marges d'au moins 16 px, pas de défilement horizontal, barre de navigation fixe avec `env(safe-area-inset-bottom)`).
- [ ] **Step 2: Implémenter l'écran « De saison »** : saison du jour par `saisonDuMois(new Date())`, interrupteur « Seulement les recettes de saison » (activé par défaut), puces entrée/plat et types, recherche, cartes (titre, catégorie, type, temps, « Livre X, page N » ou source web), message « Aucune recette avec ces filtres. » si la liste est vide.
- [ ] **Step 3: Implémenter la fiche** (`#/recette/<id>`) : « Livre X, page N » en évidence, saisons, nombre de personnes prévu par le livre (et `personnes_texte` s'il existe), réglage des personnes (+ et −, minimum 1) qui recalcule les quantités avec `facteur`, `quantiteAjustee`, `formaterQuantite` ; précision affichée à côté de l'ingrédient ; étapes numérotées ; notes ; bouton « Ajouter à ma semaine » / « Retirer de ma semaine » ; id de recette inconnu → message « Recette introuvable » avec lien de retour.
- [ ] **Step 4: Implémenter « Livres »** : une carte par livre listant ses recettes par page (lien vers la fiche), rubrique « Recettes d'internet » si des recettes web existent.
- [ ] **Step 5: Vérifier dans le navigateur** : démarrer un serveur local (`.claude/launch.json` avec `python -m http.server 8080`), ouvrir la page, vérifier à 375 px et sur ordinateur : les 3 écrans, la recherche « echalote », le réglage des personnes, aucune erreur de console, aucun défilement horizontal. Attendu : tout conforme.
- [ ] **Step 6: Commit** : `git add -A && git commit -m "Écrans De saison, fiche et Livres"`.

---

### Task 5: Interface — Ma semaine

**Files:**
- Modify: `src/app.js`, `src/style.css`

**Interfaces:**
- Consumes: `chargerSemaine`, `sauverSemaine`, `basculer`, `definirPersonnes` (`src/semaine.js`).
- Produces: écran `#/semaine` qui liste les recettes choisies, avec pour chacune le nombre de personnes à servir (+ et −, valeur de départ = personnes de la recette), les liens « Voir la fiche » et « Retirer » ; chaque changement est sauvegardé par `sauverSemaine`. La fiche reprend le nombre de personnes choisi dans la semaine si la recette y figure.

- [ ] **Step 1: Implémenter l'écran** avec le message « Rien pour l'instant. Ouvrez une recette et touchez « Ajouter à ma semaine ». » quand la semaine est vide.
- [ ] **Step 2: Vérifier dans le navigateur** : ajouter la salade, passer de 2 à 4 personnes, recharger la page (le choix est conservé), ouvrir la fiche (quantités doublées), retirer la recette ; avec le stockage bloqué (navigation privée simulée ou `localStorage` rendu inutilisable dans la console) l'appli s'ouvre sans erreur. Attendu : conforme, console sans erreur.
- [ ] **Step 3: Commit** : `git add -A && git commit -m "Écran Ma semaine"`.

---

### Task 6: Installation sur l'écran d'accueil (icônes, manifeste)

**Files:**
- Create: `manifest.json`, `scripts/make-icons.mjs`, `icon-180.png`, `icon-192.png`, `icon-512.png`
- Modify: `index.html`

**Interfaces:**
- Produces: `node scripts/make-icons.mjs` écrit les trois PNG (carrés pleins vert herbe avec un disque clair centré) sans aucune dépendance (module `zlib` de Node) ; `manifest.json` avec nom « Compilation des recettes », nom court « Recettes », `display: "standalone"`, couleur de thème, icônes ; `index.html` référence le manifeste, `apple-touch-icon` (180 px) et `apple-mobile-web-app-capable`.

- [ ] **Step 1: Écrire un test** `tests/icons.test.mjs` : après génération dans un dossier temporaire, chaque fichier commence par la signature PNG `89 50 4E 47 0D 0A 1A 0A` et sa largeur lue dans l'en-tête vaut 180, 192, 512.
- [ ] **Step 2: Lancer** — attendu : échec ; **implémenter** `scripts/make-icons.mjs` (fonction exportée + exécution directe) ; relancer — attendu : vert.
- [ ] **Step 3: Générer les icônes à la racine**, écrire `manifest.json`, compléter `index.html`, relancer `node --test tests/` et vérifier dans le navigateur que le manifeste se charge sans erreur.
- [ ] **Step 4: Commit** : `git add -A && git commit -m "Manifeste et icônes"`.

---

### Task 7: Premier lot — livre « La flemme »

**Files:**
- Create: `scripts/heic-vers-jpeg.ps1`
- Modify: `data/*.json`

**Interfaces:**
- Produces: `scripts/heic-vers-jpeg.ps1 -Dossier <chemin> -Sortie <chemin>` convertit chaque `.HEIC` du dossier en JPEG de 1 600 px de large dans le dossier de sortie, avec les outils Windows (aucune installation) ; renvoie la liste des fichiers convertis.
- Process de chaque lot (un livre, plusieurs photos) : Loïc donne le livre → conversion → lecture de chaque page (titre et page imprimés sur la photo) → brouillons présentés à Loïc avec la liste des doutes → corrections → ajout aux fichiers de données et rapprochement des ingrédients avec le référentiel (nouveaux ingrédients : rayon et saisons proposés, validés par Loïc) → journal mis à jour.

- [ ] **Step 1: Écrire le script PowerShell** à partir de la méthode déjà éprouvée (décodage WinRT puis encodage JPEG), l'essayer sur le dossier `C:\Users\entzm\Desktop\Recette` — attendu : un JPEG de 1 600 px de large par photo.
- [ ] **Step 2: Lot de Loïc** : pour chaque recette, présenter le brouillon (tableau titre, livre, page, saison, catégorie, type, personnes, ingrédients, étapes, doutes) et attendre sa validation ; ne rien écrire dans `data/` avant.
- [ ] **Step 3: Écrire les données validées**, passer les entrées du journal à `validé`, lancer `node --test tests/ && node scripts/validate-data.mjs` — attendu : vert.
- [ ] **Step 4: Mesurer le coût réel du lot** (points de la fenêtre de 5 heures avant/après, nombre de photos) pour la fiche de compte rendu.
- [ ] **Step 5: Commit** : `git add -A && git commit -m "Premier lot : La flemme"`.

---

### Task 8: Mise en ligne (sur accord explicite de Loïc uniquement)

**Files:** aucun fichier de code

- [ ] **Step 1: Présenter à Loïc** ce qui va être créé : dépôt public GitHub `Compilation-des-recettes` sous le compte connecté, site GitHub Pages sur la branche principale ; attendre un « oui » clair.
- [ ] **Step 2: Créer le dépôt, pousser, activer Pages** (`gh repo create … --public --source=. --push`, puis activer Pages sur `main`, racine) ; attendre la publication.
- [ ] **Step 3: Vérifier le site publié** : l'adresse s'ouvre, les données se chargent, console sans erreur, à 375 px et sur ordinateur.
- [ ] **Step 4: Rappeler à Loïc** les vérifications à faire sur son iPhone (ajout à l'écran d'accueil, affichage de la barre du haut et du bas, thème clair/sombre), qui ne peuvent pas être faites depuis ce PC.

---

## Self-review (faite)

- **Couverture de la spec §3 bis, §4, §5, §6, §7 (étape 1)** : personnes obligatoires (T1), réglage et recalcul (T4, T5), tables (T1), écrans De saison/fiche/Ma semaine/Livres (T4, T5), contrôles automatiques (T1), tests mobile/ordinateur (T4, T5, T8), premier livre (T7). La liste de courses et l'export Keep sont l'étape 2, hors de ce plan.
- **Arrondi à l'entier supérieur** des quantités indivisibles : dans la liste de courses (étape 2). La fiche affiche des quantités décimales (ex. « 1,5 » carotte pour 1 personne).
- **Une précision par rapport à la spec §6** : la détection de doublons porte sur livre + page + **titre** (une page peut contenir plusieurs recettes).
- **Cohérence des noms** : `validerDonnees`, `filtrerRecettes`, `chargerSemaine`, `sauverSemaine`, `basculer`, `definirPersonnes`, `lireRoute`, `quantiteAjustee`, `formaterQuantite` identiques d'une tâche à l'autre.
