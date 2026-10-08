# CLAUDE.md — Compilation des recettes

## À lire en premier
- Cahier des charges : `docs/superpowers/specs/2026-10-08-compilation-des-recettes-design.md` (validé par Loïc).
- Plan de l'étape 1 : `docs/superpowers/plans/2026-10-08-etape-1-socle.md` (8 tâches).
- Journal d'avancement (non versionné) : `.superpowers/sdd/2026-10-08-etape-1-socle/progress.md`. Il fait foi : les tâches marquées `complete` sont faites, ne pas les refaire. Il contient aussi les décisions prises (« Ruling »).
- Maquette validée sur le principe : https://claude.ai/artifact/42uxjPofRRnUfaxonmMgFi (données d'exemple).

## État (8 octobre 2026)
Tâches 1 à 6 terminées et relecture finale faite sur la branche locale `etape-1-socle` (dernier commit : origine web, focus conservé, Object.hasOwn). Tâche 7 : livre « Salade » (13 recettes) fait et validé ; reste le livre « La flemme » (64 photos dans `C:\Users\entzm\Desktop\Recette\La flemme`, à traiter par tranches de 15 à 20). Tâche 8 : mise en ligne GitHub, uniquement sur accord explicite de Loïc. Conversion des photos : `scripts/heic-vers-jpeg.ps1` (powershell.exe, -Dossier -Sortie -Largeur). Photos de plats rangées dans `photos/<id>.jpg` (le site ne les affiche pas encore). Reporté à l'étape suivante : bouton « Retour » de la fiche (history.back) et onglet actif, scrollTo(0,0) au retour, boutons +/− à 44 px, icône « maskable », theme-color sombre, message « aucune recette de saison » (l'écran De saison est vide en automne tant qu'il n'y a que la recette d'hiver).

## Mode d'exécution choisi par Loïc : mode B
Méthode `superpowers:subagent-driven-development` : un assistant neuf par tâche (modèle `sonnet`), relecture indépendante après chaque tâche (modèle `sonnet`), relecture finale (modèle `opus`). Ne pas s'arrêter entre les tâches 4 à 6. S'arrêter avant la tâche 7 (photos) et avant la tâche 8 (publication).

## Règles du projet
- Tests : `npm test` (la forme `node --test tests/` échoue sous Node 22 / Windows). Contrôle des données : `node scripts/validate-data.mjs`.
- Aucune dépendance npm, pas d'étape de build, pas de service worker (pas de hors-ligne).
- Interface en français ; nombre de personnes obligatoire pour chaque recette.
- Commits en français, terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Rien sur GitHub sans accord explicite de Loïc (dépôt public accepté, aucune donnée personnelle dans le site).
- Test sur mobile (375 px) et ordinateur, console sans erreur, avant de dire « c'est fait ».
- Serveur local pour les tests visuels : `python -m http.server 8080` (via `.claude/launch.json`).
- Photos d'iPhone (HEIC) : conversion avec les outils Windows (script prévu en tâche 7).
- Estimation en tokens et en points de la limite de 5 heures avant tout gros chantier, et compte rendu après, comme demandé dans les préférences globales. Coût observé : environ 3,5 points par tâche en mode B.
