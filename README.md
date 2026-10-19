# BookOrbit Z-Library plugin

A [BookOrbit](https://github.com/bookorbit/bookorbit) request indexer plugin that finds ebooks on
Z-Library and downloads them with your own account.

Request a book the way you request any other. Z-Library shows up as a source next to the rest; pick
its release and BookOrbit downloads the file directly, without a torrent client.

## Requirements

- A Z-Library account. Searching needs none, but every download is counted against the account's
  daily allowance.
- An HTTP download client in BookOrbit, as for any direct-download source.

## Installing

1. Download the raw plugin file, not the GitHub page:

   ```sh
   curl -fL -o zlibrary-index.mjs https://raw.githubusercontent.com/secunit404/bookorbit-zlibrary/main/indexers/zlibrary/index.mjs
   ```

2. In BookOrbit, as a superuser: **Settings > System > Requests > Plugins > Install plugin**, and
   upload it. Or copy it to `/data/plugins/indexers/zlibrary/index.mjs` and restart.
3. **Set up** the Z-Library source:
   - **Base URL**: the mirror to try first. Defaults to `https://z-lib.gd`.
   - The account, in one of two ways:
     - **Z-Library e-mail** set, and your password in the **Session ID** field. The plugin logs in
       once and keeps the session in memory, logging in again only after a restart or when the
       site rejects it.
     - **Z-Library e-mail** left empty, and your `remix_userid` and `remix_userkey` cookies in the
       **Session ID** field, written as `userid:userkey`. Find them in a logged-in browser under
       developer tools > Application > Cookies. Pasting the pair as `remix_userid=…; remix_userkey=…`
       works too. This keeps your password out of BookOrbit.
   - **Ebook formats**: which formats to search for.
   - **Fallback mirrors**: tried in order when the base URL stops answering.
   - Then **Test**, which shows how many downloads are left today.

Updates are signed and offered by BookOrbit itself.

## Domains

Z-Library changes domains often. The main domains (`z-library.sk`, `z-lib.fm` and others) put
scripts behind a cookie wall, and the plugin does not try to get past it. Instead:

- It calls the JSON API the site's own apps use (`/eapi`), which the mirrors serve to any client.
- It tries the base URL, then the fallback mirrors, and skips any that cannot be reached, redirect,
  or answer with a page instead of JSON. The mirror that answered is tried first next time.
- Every six hours BookOrbit's keepalive asks a working mirror for the site's own domain list
  (`/eapi/info/domains`) and adds those domains after the configured ones.

The domain list can only be fetched from a mirror that still works. If every mirror you have
configured dies at once, the search fails and names each mirror it tried; add a current one under
**Fallback mirrors**.

## Keeping the account safe

- **Search never sends the session.** Only the test and a grab use the account.
- **One login is reused** for as long as the site accepts it. A rejected session is replaced by one
  fresh login, never a loop, and a refused password is left alone for 15 minutes so a typo cannot
  hammer the login.
- **The e-mail is a plain setting.** Only the Session ID field is stored encrypted.
- **One grab is one download** from the daily allowance. A spent allowance is reported as rate
  limiting, and the plugin does not retry it on another mirror.

## Trust

A plugin runs inside the BookOrbit process with that process's access: your database, library
files and encryption key. `indexers/zlibrary/index.mjs` is one dependency-free file so it can be
read before installing. It talks only to the configured mirrors, the domains Z-Library itself lists,
and the download link the API returns, and only through BookOrbit's host fetch.

Which sources you point BookOrbit at, and whether you are entitled to what they hold, is your
decision and your responsibility.

## Development

```sh
node indexers/zlibrary/verify.mjs
```

checks the plugin against saved Z-Library responses and checks the signed manifest against the
source. To confirm the account endpoints against a real account, outside BookOrbit:

```sh
ZLIBRARY_EMAIL=you@example.com ZLIBRARY_PASSWORD='…' node indexers/zlibrary/try-account.mjs "Awakened" "Bernadette Blackthorn" [--download] [--pick N]
```

or with `ZLIBRARY_SESSION='remix_userid:remix_userkey'` in place of the e-mail and password.

Without `--download` it checks the session and searches, which costs nothing. `--download` resolves
the picked result, spends one daily download, and saves the file into `./zlibrary-test-<id>/`.

After any change, bump `version` in `index.mjs` and re-sign. The private key stays outside the
repository:

```sh
BOOKORBIT_PLUGIN_SIGNING_KEY=~/.config/bookorbit-plugins/zlibrary-signing-key.pem node scripts/sign-update.mjs zlibrary
```

BookOrbit verifies the manifest's SHA-256 and Ed25519 signature against the key in the installed
plugin before offering an update.
