// RAILHEAD — the competition entrypoint (main.ts).
//
// Hands the game in: copies game/ and screenshots/ from this repository into
// the output directory, then writes /output/dossier.json with the kit's
// buildDossier library (vendor/makefun-threejs.ts, unchanged from the kit).
// Node 22, standard library only. Deterministic: two runs write the same bytes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The repository root is the directory holding this file, whatever the
// working directory the grader starts from.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));

// The grader writes to /output; outside it MAKEFUN_OUTPUT_DIR stands in.
const OUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// The gate's caps, from the competition's gate.json.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function handIn(): void {
  const gameSrc = join(REPO_ROOT, 'game');
  const shotsSrc = join(REPO_ROOT, 'screenshots');
  if (!existsSync(gameSrc)) throw new Error('RAILHEAD: game/ is missing from the repository');
  if (!existsSync(shotsSrc)) throw new Error('RAILHEAD: screenshots/ is missing from the repository');

  mkdirSync(OUT_DIR, { recursive: true });
  cpSync(gameSrc, join(OUT_DIR, 'game'), { recursive: true });
  cpSync(shotsSrc, join(OUT_DIR, 'screenshots'), { recursive: true });

  const dossier = buildDossier(OUT_DIR, DOSSIER_CAPS);
  if (dossier.length === 0) throw new Error('RAILHEAD: buildDossier wrote an empty dossier');
  writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);
  console.log(`RAILHEAD handed in: ${dossier.length} byte dossier in ${OUT_DIR}`);
}

handIn();
