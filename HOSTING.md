# Putting client sites online

Client sites go on **Cloudflare Pages** (project `louped`, at
`https://louped.pages.dev/`), with **Cloudflare Access** in front. Each site
is at `https://louped.pages.dev/<site>/`, and each one has its own Access
application, so a client can open only their own map. People sign in with a
one-time code sent to their email: no passwords. Access is free for up to 50
people across the account.

Nothing goes through GitHub: `sites/`, `dist/` and `online.json` are
git-ignored. The LINZ key (`assets/keys.json`) is never deployed, so hosted
sites use Esri base maps.

## From inferrd.'s Louped tab (v0.15.0)

Sites made in inferrd.'s **Louped** tab go online from the tab itself
(section 6 · Online), with no deploy:

- **louped-admin** (`host/admin/`, a Worker at
  `https://louped-admin.rutherfordecology.workers.dev/`) takes the site's
  files from the tab and writes them to Workers KV (namespace id in
  `wrangler.toml`). It answers only inferrd.'s own pages
  (rutherfordecology.github.io, and localhost:7899 and :7883 for testing)
  and only with your **Louped key**.
- The `louped` Pages project serves them: `dist/_worker.js` (copied from
  `host/site/_worker.js` by every `npm run online`) looks a path up in KV
  first and falls back to the static sites in `dist/`, so sites put online
  by the studio keep working.
- KV keys: `cur:<site>` says which version is live; `f:<site>:<v>:<path>`
  holds each file. A new version is written beside the old one and switched
  to in one step (commit), then the old one is deleted, so a client never
  sees half a site.
- Free limits: 1 GB of KV, 1000 writes and deletes a day (each file put online is one, and
  so is each file of the version it replaces), 25 MiB a file.

**Your Louped key** is `loupedAdminKey` in `cloudflare.json` (git-ignored).
Enter it once in the tab; that browser keeps it. To change it:
`npx -y wrangler@4.157.0 secret put ADMIN_KEY --config host/admin/wrangler.toml`,
then update `cloudflare.json` and enter it again in the tab.

**Who can see each site.** Without a Cloudflare API token the domain-wide
"Allow Members" Access application covers every site, so only you can open
a new one until you add its own Access application by hand (Each client
site, step 2, below). To let the tab do that, make a token (My Profile →
API Tokens → Custom token, **Account → Access: Apps and Policies → Edit**,
your account only) and give it to louped-admin:

```
npx -y wrangler@4.157.0 secret put CF_API_TOKEN --config host/admin/wrangler.toml
```

Then the tab's list of people (emails, or whole domains) or "anyone with the
link" makes or updates the site's Access application when you put it
online, and Take offline can delete it. `OWNERS` in
`host/admin/wrangler.toml` is always added, so you're never locked out.

To change the Workers: `npx -y wrangler@4.157.0 deploy --config host/admin/wrangler.toml`
for louped-admin; `npm run online` for the Pages side.

## Once

1. Sign in: `npx -y wrangler@4.157.0 login` (the account that has
   `gbif-proxy` and `inferrd-auth`).
2. Create the project (done 2026-11-05):
   `npx -y wrangler@4.157.0 pages project create louped --production-branch main --force`
   Wrangler 4.157 sends new Pages projects to Workers unless `--force` is
   given; it's needed only on create.
3. Lock the whole domain to you, **before** the first deploy:
   - Workers & Pages → `louped` → Settings → General → **Enable access
     policy**. This protects the preview addresses (`*.louped.pages.dev`).
   - Zero Trust → Access → Applications → the `louped` application it made →
     add the public hostname `louped.pages.dev` (no path) beside the
     preview one. Policy: **Allow**, include **Emails** = your own address.
   - Zero Trust → Settings → Authentication: **One-time PIN** is on.

Done 2026-11-05: previews restricted (Settings → General → Preview
access → Restrict previews) and `louped.pages.dev` added to the
"louped - Cloudflare Pages" Access application, policy "Allow Members"
(members of the Cloudflare account). Zero Trust asks for a plan before
more applications can be made: choose **Free** (up to 50 people).

## The studio without a terminal (v0.8.1)

`studio/start-studio.vbs` starts the studio with no window, so a bookmark to
http://localhost:7884/ works. Its output goes to `run.log`. To start it at
every Windows sign-in, put a shortcut to it in the Startup folder once, in
PowerShell:

```
$s=(New-Object -ComObject WScript.Shell).CreateShortcut("$([Environment]::GetFolderPath('Startup'))\Louped studio.lnk"); $s.TargetPath="$env:SystemRoot\System32\wscript.exe"; $s.Arguments='"C:\Users\User\tools\catchment_reports\studio\start-studio.vbs"'; $s.Save()
```

To stop it starting, delete `Louped studio.lnk` from the Startup folder
(Win+R, `shell:startup`). To stop it now, end the `node.exe` that is
running `studio\server.mjs` in Task Manager (Details tab, Command line
column). After changing the studio's code, stop it and double-click
`start-studio.vbs` to restart it.

## From the studio (v0.8.0)

The studio can do the per-site steps below for you: under **Online** on a
site, choose who can see it, then **Put online**, **Update online** or
**Take offline**. Those buttons run the same deploy as `npm run online`.

To let the studio set who can see each site, make `cloudflare.json` in the
repo root once (git-ignored; copy `cloudflare.example.json`):

1. Cloudflare dashboard → My Profile → API Tokens → **Create Token** →
   Custom token. Permission: **Account → Access: Apps and Policies → Edit**,
   for your account only. Copy the token into `apiToken`.
2. `accountId`: on the dashboard's account home page (Account ID). It can
   be left out if the token sees only one account.
3. `ownerEmails`: the email(s) you sign in with. They are added to every
   site, so a site's own Access application never locks you out.

With it, **Save who can see it** makes or updates the site's Access
application on Cloudflare (a list of people, or anyone with the link), and
**Put online** refuses a site that has none. Without it, the studio saves
the list locally and asks you to confirm you made the application by hand.
Restart the studio after making `cloudflare.json`.

"Anyone with the link" sets the site's policy to Bypass: no sign-in. Give
such a site a name ending in random characters (`waimata-k7q3vx`), so it
can't be guessed.

## Each client site

1. Make it in the studio (`npm run studio`) and check it there.
2. Zero Trust → Access → Applications → **Add an application** →
   Self-hosted:
   - name: the site name, e.g. `louped test-block`
   - public hostname: `louped.pages.dev`, path `test-block/` (the site name)
   - policy: **Allow**, include **Emails** (each person) or **Emails ending
     in** (e.g. `@catchmentgroup.org.nz`); add your own email too
   - session duration: 24 hours or a week
   A path application is more specific than the domain one, so these people
   get this site only, and everything else stays yours.
3. `npm run online -- add <site>`, then `npm run online` to deploy.
4. Open `https://louped.pages.dev/<site>/` in a private window: you should
   get the Cloudflare sign-in page, not the map. Then send the link.

## Commands

```
npm run online -- list            what is online and what isn't
npm run online -- add <site>      put a site on the online list
npm run online -- remove <site>   take a site off the list
npm run online                    deploy exactly the sites on the list
npm run online -- --dry           build dist/ only
```

Every deploy replaces the whole hosted site with what's on the list. A site
taken off the list goes offline at the next deploy; delete its Access
application too.

## Adding or removing a person

Zero Trust → Access → Applications → the site's application → Policies.
It takes effect at once; no deploy needed.

## Notes

- Every page sends `X-Robots-Tag: noindex`, but Access is what keeps a site
  private.
- Sites are snapshots: a new package from inferrd. needs a new deploy.
