#!/usr/bin/env node
/**
 * prove-real.mjs — les preuves en direct : ce dépôt contre son environnement
 * réel, pas contre des fixtures.
 *
 * Huit preuves, chacune rendant un verdict OK / KO avec ses valeurs :
 *
 *   1. base-opencode      la base SQLite OpenCode vivante existe et pèse ;
 *   2. recolte-fraiche    la récolte tournée À L'INSTANT sur la base vivante
 *                         donne au moins les sessions du jeu versionné ;
 *   3. jeu-versionne      le jeu `src/sample/opencode-real.json` : volume,
 *                         tickets, jetons, heures, modèles, aucune donnée
 *                         personnelle ;
 *   4. lab-commits        le bac à sable contient de vrais commits signés
 *                         d'un agent, avec une clé de ticket PROJ- ;
 *   5. lab-journal        `tools/lab/real-runs.json` colle aux commits réels
 *                         du bac à sable ;
 *   5b. lab-attribution   chaque session du journal est bien attribuée à son
 *                         ticket, dans l'historique du bac à sable ;
 *   6. coherence-site     le site public affiche les mêmes chiffres réels que
 *                         le jeu versionné ;
 *   7. lab-rejouable      `run-session.sh --dry-run` liste les tickets sans
 *                         rien lancer.
 *
 * Usage :
 *   node tools/prove-real.mjs [--out docs/PREUVES-REELLES.md] [--json]
 *
 * Variables d'environnement :
 *   OPENCODE_DB   base des sessions (défaut : celle de la machine)
 *   LAB_DIR       bac à sable (défaut : ~/Bureau/opencode-lab)
 *   SKIP_RESEAU   1 → la preuve 6 est sautée (machine hors ligne)
 *
 * Le verdict s'écrit dans `--out` (et sur la sortie standard) ; le code de
 * sortie vaut 1 si au moins une preuve est KO.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAISON = process.env.HOME ?? process.env.USERPROFILE ?? '';
const BASE = process.env.OPENCODE_DB ?? join(MAISON, '.local/share/opencode/opencode.db');
const JEU = join(RACINE, 'src/sample/opencode-real.json');
const LAB = process.env.LAB_DIR ?? join(MAISON, 'Bureau/opencode-lab');
const URL_SITE = 'https://tradoooo.github.io/delegable-ou-pas/demo-data.json';

const MOTIF_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MOTIF_TICKET = /^PROJ-\d+$/;
const MOTIF_MENTION = /Co-authored-by:\s*OpenCode/;

function args() {
  const rest = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--out') out.out = resolve(rest[++i] ?? '');
    else if (rest[i] === '--json') out.json = true;
    else if (rest[i] === '--help') out.help = true;
  }
  return out;
}

function lireJeu(chemin) {
  const brut = JSON.parse(readFileSync(chemin, 'utf8'));
  const sessions = Array.isArray(brut) ? brut : brut.sessions;
  return { brut: readFileSync(chemin, 'utf8'), sessions, entete: brut };
}

function resume(sessions) {
  let jetons = 0;
  let heures = 0;
  let avecTicket = 0;
  const modeles = new Set();
  for (const session of sessions) {
    jetons += (session.tokensIn ?? 0) + (session.tokensOut ?? 0);
    heures += Math.max(0, session.durationMs ?? 0);
    if (session.issueKey) avecTicket += 1;
    modeles.add(`${session.model?.provider ?? ''}/${session.model?.id ?? ''}`);
  }
  return { sessions: sessions.length, jetons, heures: heures / 3_600_000, avecTicket, modeles: modeles.size };
}

function preuve(nom, ok, lignes) {
  return { nom, ok, lignes };
}

function humainMoctets(octets) {
  return `${Math.round(octets / 1_048_576)} Mo`;
}

/* 1 — la base vivante. */
function preuveBase() {
  if (!existsSync(BASE)) return preuve('base-opencode', false, [`absent : ${BASE}`]);
  const stat = statSync(BASE);
  const fraiche = new Date(stat.mtimeMs).toISOString();
  return preuve('base-opencode', stat.size > 0, [
    `chemin : ${BASE}`,
    `taille : ${humainMoctets(stat.size)}`,
    `modifiée : ${fraiche}`,
  ]);
}

/* 2 — la récolte rejouée maintenant sur la base vivante. */
function preuveRecolte() {
  const repli = mkdtempSync(join(tmpdir(), 'prove-real-'));
  const sortie = join(repli, 'recolte.json');
  try {
    execFileSync('node', [join(RACINE, 'tools/opencode/harvest.mjs'), '--db', BASE, '--out', sortie], {
      timeout: 300_000,
      stdio: 'pipe',
    });
    const frais = lireJeu(sortie).sessions;
    const versionne = lireJeu(JEU).sessions;
    const dernierFrais = frais.length
      ? new Date(Math.max(...frais.map((session) => Date.parse(session.startedAt)))).toISOString()
      : '-';
    const ecart = frais.length - versionne.length;
    return preuve('recolte-fraiche', frais.length >= versionne.length && frais.length > 0, [
      `sessions récoltées à l'instant : ${frais.length}`,
      `sessions versionnées : ${versionne.length}`,
      `écart à rejouer dans le dépôt : ${ecart > 0 ? `+${ecart}` : 'aucun'}`,
      `session la plus récente : ${dernierFrais}`,
    ]);
  } finally {
    rmSync(repli, { recursive: true, force: true });
  }
}

/* 3 — le jeu versionné. */
function preuveJeu() {
  const { brut, sessions } = lireJeu(JEU);
  const res = resume(sessions);
  const fuite = brut.includes('/home/') || brut.includes(MAISON) || MOTIF_EMAIL.test(brut);
  return preuve('jeu-versionne', sessions.length > 0 && !fuite, [
    `sessions : ${res.sessions}`,
    `rattachées à un ticket : ${res.avecTicket}`,
    `jetons : ${res.jetons.toLocaleString('fr-FR')}`,
    `heures : ${res.heures.toFixed(2)}`,
    `modèles : ${res.modeles}`,
    `donnée personnelle : ${fuite ? 'OUI' : 'non'}`,
  ]);
}

/* 4 — les commits réels du bac à sable. */
function preuveLabCommits() {
  if (!existsSync(join(LAB, '.git'))) return preuve('lab-commits', false, [`pas un dépôt : ${LAB}`]);
  const sujet = execGit(LAB, 'log', '--format=%s');
  const corps = execGit(LAB, 'log', '--format=%b');
  const avecTicket = sujet.filter((ligne) => MOTIF_TICKET.test(ligne.split(' ')[0] ?? '')).length;
  const signes = corps.filter((ligne) => MOTIF_MENTION.test(ligne)).length;
  return preuve('lab-commits', avecTicket > 0 && signes > 0, [
    `commits portant une clé PROJ- : ${avecTicket}`,
    `commits avec mention d'agent (Co-authored-by) : ${signes}`,
    `dernier : ${sujet[0] ?? '-'}`,
  ]);
}

/* 5 — real-runs.json colle aux commits du bac à sable. */
function preuveLabJournal() {
  const chemin = join(RACINE, 'tools/lab/real-runs.json');
  if (!existsSync(chemin)) return preuve('lab-journal', false, [`absent : ${chemin}`]);
  const sessions = lireJeu(chemin).sessions;
  const shas = new Set(execGit(LAB, 'rev-list', '--all'));
  const avecSha = sessions.filter((session) => session.sha);
  const inconnues = avecSha.filter((session) => !shas.has(session.sha)).length;
  const sansCommit = sessions.length - avecSha.length;
  return preuve('lab-journal', sessions.length > 0 && inconnues === 0, [
    `sessions du journal : ${sessions.length}`,
    `sha absents de l'historique du lab : ${inconnues}`,
    `sessions sans commit (l'agent n'a rien eu à faire) : ${sansCommit}`,
  ]);
}

/* 5 bis — chaque session est attribuée à son ticket, dans l'historique. */
function preuveAttribution() {
  const chemin = join(RACINE, 'tools/lab/real-runs.json');
  if (!existsSync(chemin)) return preuve('lab-attribution', false, [`absent : ${chemin}`]);
  const sessions = lireJeu(chemin).sessions.filter((session) => session.sha);
  if (sessions.length === 0) return preuve('lab-attribution', false, ['aucune session avec commit']);
  const fautifs = [];
  for (const session of sessions) {
    const sujet = execGit(LAB, 'show', '-s', '--format=%s', session.sha)[0] ?? '';
    if (!sujet.startsWith(`${session.ticket} `)) fautifs.push(`${session.ticket} → ${sujet.slice(0, 40)}`);
  }
  return preuve('lab-attribution', fautifs.length === 0, [
    `sessions attribuées à leur ticket : ${sessions.length - fautifs.length}/${sessions.length}`,
    ...fautifs.map((ligne) => `attribution fautive : ${ligne}`),
  ]);
}

/* 6 — le site public montre les mêmes chiffres réels. */
async function preuveSite() {
  if (process.env.SKIP_RESEAU === '1') return preuve('coherence-site', true, ['sautée (SKIP_RESEAU=1)']);
  try {
    const reponse = await fetch(URL_SITE, { signal: AbortSignal.timeout(20_000) });
    if (!reponse.ok) return preuve('coherence-site', false, [`HTTP ${reponse.status}`]);
    const reel = (await reponse.json()).features?.donneesReelles;
    const versionne = resume(lireJeu(JEU).sessions);
    const egaux =
      reel &&
      reel.sessions === versionne.sessions &&
      reel.tickets === versionne.avecTicket &&
      reel.jetons === versionne.jetons &&
      Math.abs((reel.heures ?? 0) - Math.round(versionne.heures * 100) / 100) < 1;
    return preuve('coherence-site', Boolean(egaux), [
      `site  : ${reel?.sessions ?? '-'} sessions, ${reel?.tickets ?? '-'} tickets, ${reel?.jetons ?? '-'} jetons`,
      `dépôt : ${versionne.sessions} sessions, ${versionne.avecTicket} tickets, ${versionne.jetons} jetons`,
    ]);
  } catch (erreur) {
    return preuve('coherence-site', false, [`réseau indisponible : ${erreur.message}`]);
  }
}

/* 7 — le lab se relance. */
function preuveRejouable() {
  try {
    const sortie = execFileSync('bash', [join(RACINE, 'tools/lab/run-session.sh'), '--dry-run'], {
      timeout: 60_000,
      stdio: 'pipe',
    }).toString();
    const tickets = sortie.split('\n').filter((ligne) => MOTIF_TICKET.test(ligne.trim().split(' ')[0] ?? ''));
    return preuve('lab-rejouable', sortie.includes('PROJ-'), [
      `tickets listés : ${tickets.length}`,
    ]);
  } catch (erreur) {
    return preuve('lab-rejouable', false, [`échec : ${erreur.message}`]);
  }
}

function execGit(repertoire, ...commande) {
  return execFileSync('git', ['-C', repertoire, ...commande], { timeout: 30_000, stdio: 'pipe' })
    .toString()
    .split('\n')
    .filter(Boolean);
}

function rendreMarkdown(preuves, horodatage) {
  const lignes = ['# Preuves réelles — « Délégable ou pas ? »', '', `Généré le ${horodatage} par \`tools/prove-real.mjs\`.`, ''];
  lignes.push('| preuve | verdict |', '|---|---|');
  for (const preuve of preuves) {
    lignes.push(`| ${preuve.nom} | ${preuve.ok ? '✅ OK' : '❌ KO'} |`);
  }
  lignes.push('');
  for (const preuve of preuves) {
    lignes.push(`## ${preuve.nom}`, '');
    for (const ligne of preuve.lignes) lignes.push(`- ${ligne}`);
    lignes.push('');
  }
  return `${lignes.join('\n')}\n`;
}

async function principal() {
  const options = args();
  if (options.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 23).join('\n'));
    return;
  }
  const preuves = [
    preuveBase(),
    preuveRecolte(),
    preuveJeu(),
    preuveLabCommits(),
    preuveLabJournal(),
    preuveAttribution(),
    await preuveSite(),
    preuveRejouable(),
  ];
  const horodatage = new Date().toISOString();
  if (options.json) {
    console.log(JSON.stringify({ horodatage, preuves }, null, 2));
  } else {
    const markdown = rendreMarkdown(preuves, horodatage);
    console.log(markdown);
    if (options.out) writeFileSync(options.out, markdown, 'utf8');
  }
  process.exitCode = preuves.every((preuve) => preuve.ok) ? 0 : 1;
}

principal();