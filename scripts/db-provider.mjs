// Rewrites prisma/schema.prisma datasource provider per DATABASE_PROVIDER env.
// Supports: sqlite (default) | postgresql | mysql  — see DEVELOPER_GUIDE.md §4.1
import { readFileSync, writeFileSync } from 'node:fs';

const provider = (process.env.DATABASE_PROVIDER || 'sqlite').toLowerCase();
const allowed = ['sqlite', 'postgresql', 'mysql'];
if (!allowed.includes(provider)) {
  console.error(`DATABASE_PROVIDER must be one of ${allowed.join(', ')} — got "${provider}"`);
  process.exit(1);
}

const path = new URL('../prisma/schema.prisma', import.meta.url);
let schema = readFileSync(path, 'utf8');

if (!/^datasource\s+db\s*\{/m.test(schema)) {
  console.error('datasource db block not found in prisma/schema.prisma');
  process.exit(1);
}

schema = schema.replace(
  /datasource\s+db\s*\{[\s\S]*?\}/,
  `datasource db {\n  provider = "${provider}"\n  url      = env("DATABASE_URL")\n}`
);

writeFileSync(path, schema);
console.log(`prisma schema provider set to "${provider}" (DATABASE_URL from .env)`);
