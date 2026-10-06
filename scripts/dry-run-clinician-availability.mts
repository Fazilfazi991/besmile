import { readFileSync, writeFileSync } from 'node:fs';
import * as normalizer from '../src/lib/clinician-availability-normalizer';
const normalize = (normalizer as any).normalizeClinicianAvailability || (normalizer as any).default?.normalizeClinicianAvailability;
const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) throw Error('Provide the reviewed source-groups JSON path and an output JSON path. This command has no database connection.');
const rows = JSON.parse(readFileSync(sourcePath, 'utf8'));
writeFileSync(outputPath, JSON.stringify(rows.map(normalize), null, 2));
console.log(`Wrote ${rows.length} availability dry runs; no database connection or mutation.`);
