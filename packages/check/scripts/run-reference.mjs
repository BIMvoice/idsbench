// Runs the official buildingSMART ids-tool over every corpus file and records its verdict.
// usage: node scripts/run-reference.mjs <path-to-ids-tool> <out.json> [corpus-dir]
// Needs a .NET runtime able to run the tool (set DOTNET_ROOT / DOTNET_ROLL_FORWARD=Major if only a newer one is installed).
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [tool, out, corpusArg] = process.argv.slice(2);
const corpus = corpusArg ?? join(here, '..', 'test', 'fixtures', 'corpus');
if (!tool || !out) { console.error('usage: run-reference.mjs <ids-tool> <out.json>'); process.exit(2); }

function walk(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ids') ? [p] : [];
  });
}
const files = walk(corpus).sort();
const results = [];
for (const f of files) {
  const r = spawnSync(tool, ['audit', f], { encoding: 'utf8', timeout: 120000 });
  const lines = (r.stdout + r.stderr).split('\n');
  const messages = [];
  let status = null;
  let version = null;
  for (const l of lines) {
    const m = /^(fail|crit|warn): \S+ (.*)$/.exec(l);
    if (m) {
      const code = /^(?:Error|Warning)? ?(\d{3}):/.exec(m[2]) ?? /Error (\d{3}):/.exec(m[2]);
      messages.push({ level: m[1], code: code ? code[1] : null, text: m[2].replaceAll(corpus, '<corpus>') });
    }
    const s = /Completed with status: (.*)\./.exec(l);
    if (s) status = s[1];
    const v = /The file schema version is: (\w+)/.exec(l);
    if (v) version = v[1];
  }
  const errors = messages.filter((m) => m.level !== 'warn');
  results.push({
    file: relative(corpus, f),
    exitCode: r.status,
    status,
    schemaVersion: version,
    verdict: r.status === 0 && errors.length === 0 ? 'valid' : 'invalid',
    messages,
  });
}
writeFileSync(out, JSON.stringify({ tool: 'ids-tool.CommandLine 1.0.124', results }, null, 1) + '\n');
console.log(`${results.length} files; invalid=${results.filter((x) => x.verdict === 'invalid').length}`);
