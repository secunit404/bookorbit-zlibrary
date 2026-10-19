/**
 * One real run against your own Z-Library account, outside BookOrbit, to confirm the parts
 * verify.mjs can only stub: the session, the daily allowance, the download link and the file.
 *
 *   ZLIBRARY_EMAIL=you@example.com ZLIBRARY_PASSWORD='…' node indexers/zlibrary/try-account.mjs "<title>" ["<author>"] [--download] [--pick N] [--mirror https://z-lib.gd]
 *   ZLIBRARY_SESSION='remix_userid:remix_userkey' node indexers/zlibrary/try-account.mjs "<title>" …
 *
 * Either log in with the e-mail and password, or pass the remix_userid and remix_userkey cookies of a
 * logged-in browser. Without
 * --download it only checks the session and searches, which costs nothing. --download resolves the
 * picked result (the first by default), which spends one of the day's downloads, and saves it into
 * ./zlibrary-test-<book id>/.
 *
 * Request paths and statuses are printed; the password, session and signed download links are not.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import plugin from './index.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const download = args.includes('--download');
const pick = Number(flag('--pick') ?? 1);
const mirror = flag('--mirror') ?? plugin.defaultBaseUrl;
const [title, author] = args.filter((arg, index) => !arg.startsWith('--') && !['--pick', '--mirror'].includes(args[index - 1]));
const email = process.env.ZLIBRARY_EMAIL;
const credential = email ? process.env.ZLIBRARY_PASSWORD : process.env.ZLIBRARY_SESSION;

if (!title || !credential || !Number.isInteger(pick) || pick < 1) {
  console.error('usage: ZLIBRARY_EMAIL=… ZLIBRARY_PASSWORD=… node indexers/zlibrary/try-account.mjs "<title>" ["<author>"] [--download] [--pick N] [--mirror URL]');
  console.error('   or: ZLIBRARY_SESSION=userid:userkey node indexers/zlibrary/try-account.mjs "<title>" …');
  process.exit(2);
}

const host = {
  async fetch(url, init = {}) {
    const { hostname, pathname } = new URL(url);
    let response;
    try {
      response = await fetch(url, { method: init.method ?? 'GET', headers: init.headers, body: init.body, redirect: init.redirect ?? 'follow', signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      console.log(`  ${(init.method ?? 'GET').padEnd(4)} ${hostname}${pathname} -> ${error.name}`);
      throw Object.assign(new Error(`${hostname}: ${error.message}`), { failure: error.name === 'TimeoutError' ? 'timeout' : 'unreachable' });
    }
    console.log(`  ${(init.method ?? 'GET').padEnd(4)} ${hostname}${pathname} -> ${response.status}`);
    return response;
  },
  logger: { log: (message) => console.log(`  plugin: ${message}`), warn: (message) => console.log(`  plugin WARN: ${message}`) },
  buildSearchText: (query) => [query.title, query.author].filter(Boolean).join(' '),
  saveCredential: async () => {},
  fail: (failure, message) => Object.assign(new Error(message), { failure }),
};

const config = {
  id: 1,
  name: 'Z-Library',
  baseUrl: mirror,
  credential,
  allowPrivateAddress: false,
  categories: { ebook: [], audiobook: [] },
  settings: email ? { email } : null,
};

const failed = (error) => {
  console.error(`\nFAILED (${error.failure ?? 'error'}): ${error.message}`);
  process.exit(1);
};

console.log(`Checking the ${email ? 'login' : 'session'} on ${new URL(mirror).hostname}`);
const tested = await plugin.test(config, host);
if (!tested.success) failed({ failure: 'unauthorized', message: tested.error });
console.log(`  ${tested.indexerName}`);

console.log(`\nSearching "${[title, author].filter(Boolean).join(' ')}"`);
let releases;
try {
  releases = await plugin.search({ title, author: author ?? null, isbn13: null, isbn13s: [], mediaKind: 'ebook', language: null, limit: 10 }, config, host, AbortSignal.timeout(20_000));
} catch (error) {
  failed(error);
}
releases.forEach((release, index) => {
  const size = release.sizeBytes ? `${(release.sizeBytes / 1024 / 1024).toFixed(2)} MB` : '?';
  console.log(`  ${String(index + 1).padStart(2)}. ${release.title} | ${release.author ?? '-'} | ${release.format} ${release.language ?? '-'} ${size}`);
});
if (releases.length === 0) failed({ failure: 'error', message: 'nothing found' });

if (!download) {
  console.log('\nOK. Run again with --download (and --pick N) to fetch one, which spends a daily download.');
  process.exit(0);
}

const release = releases[pick - 1];
if (!release) failed({ failure: 'error', message: `there is no result ${pick}` });

console.log(`\nResolving ${pick}. ${release.title}`);
let file;
try {
  file = await plugin.resolveFile(release, config, host, AbortSignal.timeout(30_000));
} catch (error) {
  failed(error);
}
console.log(`  file  ${file.fileName} (${file.format})`);
console.log(`  link  ${new URL(file.url).hostname} (signed, not shown)`);

// No cookie on purpose: BookOrbit's download client gets the bare link, so this has to work without one.
const response = await fetch(file.url, { headers: { 'User-Agent': 'BookOrbit' } });
console.log(`  GET   ${new URL(file.url).hostname} -> ${response.status} ${response.headers.get('content-type') ?? ''}`);
if (!response.ok) failed({ failure: 'error', message: `the download link answered ${response.status} without the session` });

const bytes = Buffer.from(await response.arrayBuffer());
const directory = resolve(`zlibrary-test-${release.guid.split('-')[0]}`);
await mkdir(directory, { recursive: true });
const path = join(directory, file.fileName);
await writeFile(path, bytes);

const zip = bytes.subarray(0, 2).toString('latin1') === 'PK';
const mobi = bytes.subarray(60, 68).toString('latin1') === 'BOOKMOBI';
const looksRight = file.format === 'epub' ? zip : ['mobi', 'azw', 'azw3'].includes(file.format) ? mobi : bytes.length > 0;
console.log(`  saved ${path}, ${bytes.length} bytes${release.sizeBytes ? ` (search said ${release.sizeBytes})` : ''}`);
if (!looksRight) failed({ failure: 'error', message: `the file does not look like ${file.format}; it may be an HTML page. Open it to check.` });
console.log('\nOK. Open the book in a reader to check it.');
