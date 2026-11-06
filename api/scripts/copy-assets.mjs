// Copies non-TypeScript files (SQL migrations, seed runbooks, eval questions) into dist/.
import { cpSync } from 'node:fs';
for (const dir of ['db/migrations', 'seed/runbooks']) cpSync(`src/${dir}`, `dist/${dir}`, { recursive: true });
for (const f of ['seed/incidents.json', 'evals/questions.json']) cpSync(`src/${f}`, `dist/${f}`);
console.log('assets copied');
