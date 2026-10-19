import { createHash, createPrivateKey, sign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'secunit404/bookorbit-zlibrary';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const type = process.argv[2];
const privateKeyPath = process.env.BOOKORBIT_PLUGIN_SIGNING_KEY;
if (!type || !/^[a-z0-9][a-z0-9-]{0,29}$/.test(type)) {
  throw new Error('Usage: BOOKORBIT_PLUGIN_SIGNING_KEY=/path/to/key.pem node scripts/sign-update.mjs <plugin>');
}
if (!privateKeyPath) throw new Error('BOOKORBIT_PLUGIN_SIGNING_KEY must name an Ed25519 private key');

const source = await readFile(resolve(root, 'indexers', type, 'index.mjs'));
const module = await import(`${new URL(`../indexers/${type}/index.mjs`, import.meta.url).href}?signing=${Date.now()}`);
const plugin = module.default;
if (plugin?.type !== type || typeof plugin.version !== 'string') throw new Error('The plugin type or version is missing');

const manifest = {
  schemaVersion: 1,
  type,
  version: plugin.version,
  sourceUrl: `https://raw.githubusercontent.com/${REPOSITORY}/main/indexers/${type}/index.mjs`,
  sha256: createHash('sha256').update(source).digest('hex'),
  signature: sign(null, source, createPrivateKey(await readFile(privateKeyPath))).toString('base64'),
};
const output = resolve(root, 'updates', `${type}.json`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Updated updates/${type}.json for ${type} ${plugin.version}\n`);
