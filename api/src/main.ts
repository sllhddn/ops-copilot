import { createApp } from './bootstrap.js';
import { loadConfig } from './config.js';
import { connectEmbedded, connectPostgres, migrate } from './db/db.js';

const config = loadConfig();
const db = config.databaseUrl ? await connectPostgres(config.databaseUrl) : await connectEmbedded(process.env.PGLITE_DIR ?? './.pglite');
const applied = await migrate(db);
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);

const app = await createApp({ config, db });
await app.listen(config.port);
console.log(`ops-copilot API on http://localhost:${config.port} | database: ${config.databaseUrl ? 'PostgreSQL' : 'embedded PGlite'} | model: ${config.anthropicApiKey ? config.anthropicModel : 'offline (set ANTHROPIC_API_KEY for Claude)'}`);
