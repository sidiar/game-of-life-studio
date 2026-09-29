# Operations runbook

Everything that lives **outside the code** and that a future maintainer (most likely future
you) has to know to keep https://game-of-life-studio.com up. Keep this file current: it is the
only record of these settings — none of them are reproducible from the repository alone.

## Overview

| Concern       | Where                                    | Cost |
| ------------- | ---------------------------------------- | ---- |
| Hosting       | GitHub Pages (this repo, Actions source) | $0   |
| Domain        | Cloudflare Registrar                     | ~€10–15/yr |
| DNS           | Cloudflare (nameservers `piotr`/`frida.ns.cloudflare.com`) | $0 |
| TLS cert      | Let's Encrypt, issued and renewed by GitHub Pages | $0 |
| Deploy        | `deploy` job in `.github/workflows/ci.yml` | $0 |

Canonical URL is **`https://game-of-life-studio.com`**. These all 301 to it:
`http://game-of-life-studio.com`, `https://www.game-of-life-studio.com`,
`https://sidiar.github.io/game-of-life-studio/`.

## Domain (Cloudflare Registrar)

- Name: `game-of-life-studio.com`
- Registered: 2026-09-14, account: Sidiar's Cloudflare account
- Auto-renew: _(fill in: on/off)_ · Renewal date: _(fill in)_
- Cloudflare Registrar sells at cost; there is no upsell tier to manage. If the card on file
  expires, the domain lapses at renewal and the site (and the CV link) goes dark — check the
  renewal date once a year.

## DNS (Cloudflare)

All records are **proxy OFF** ("DNS only", grey cloud). This is load-bearing: GitHub validates
the domain and issues/renews the certificate by checking that it resolves to GitHub's own IPs.
With the orange cloud on, GitHub sees Cloudflare's edge instead, certificate renewal fails, and
"Enforce HTTPS" turns itself off.

| Type  | Name                             | Content                          | Proxy    |
| ----- | -------------------------------- | -------------------------------- | -------- |
| A     | `@`                              | `185.199.108.153`                | DNS only |
| A     | `@`                              | `185.199.109.153`                | DNS only |
| A     | `@`                              | `185.199.110.153`                | DNS only |
| A     | `@`                              | `185.199.111.153`                | DNS only |
| CNAME | `www`                            | `sidiar.github.io`               | DNS only |
| TXT   | `_github-pages-challenge-sidiar` | _(verification token, from GitHub → Settings → Pages → verified domains)_ | — |

GitHub's current IPs are listed at
<https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>
— if a deploy is green but the site is unreachable, compare them first.

**If the Cloudflare proxy is ever turned on** (for caching/analytics): set Cloudflare
**SSL/TLS → Full (strict)** first, otherwise the HTTP→HTTPS redirect on both sides produces a
redirect loop. Expect GitHub's "Enforce HTTPS" to become unreliable; the simpler configuration
is proxy off.

## GitHub Pages (repo settings)

Settings → Pages:

- **Source:** GitHub Actions (`build_type: workflow`). There is no branch deploy; only the
  `deploy` job publishes.
- **Custom domain:** `game-of-life-studio.com`, bound by `apps/web/public/CNAME`. The static
  export copies that file into `out/` verbatim. **Do not delete or rename it** — a deploy
  without `CNAME` unbinds the domain and the site falls back to `sidiar.github.io/...`.
- **Enforce HTTPS:** on.
- **Verified domain:** `game-of-life-studio.com` is verified at the account level (Settings →
  Pages → Verified domains, the TXT record above). This stops another GitHub user from binding
  the domain to their own Pages site if ours is ever unpublished.

Settings → Environments → `github-pages` → Deployment branches and tags:

- **Allowed:** branch `main` and tag `v*`. The deploy runs on tag refs, so **the `v*` tag rule
  is load-bearing** — without it `deploy-pages` is rejected. (`main` is kept but no longer
  deploys.) From the CLI:

  ```bash
  gh api repos/sidiar/game-of-life-studio/environments/github-pages/deployment-branch-policies \
    --jq '.branch_policies[] | {name, type}'
  ```

Check the live configuration from the CLI:

```bash
gh api repos/sidiar/game-of-life-studio/pages \
  --jq '{build_type, cname, https_enforced, protected_domain_state, status}'
```

Expected: `build_type: workflow`, `cname: game-of-life-studio.com`, `https_enforced: true`,
`protected_domain_state: verified`.

## How a deploy happens

Merging to `main` runs CI but **does not deploy**. A release is an explicit tag:

```bash
git switch main && git pull --ff-only
git tag -a v1.2.0 -m "v1.2.0"   # semver; annotated so the tag carries date + author
git push origin v1.2.0
```

1. The `v*` tag push triggers `.github/workflows/ci.yml` on the tagged commit.
2. `quality` runs the full gate and, on tag pushes only, uploads `apps/web/out` as the Pages
   artifact — the same bytes `bundle:check` measured.
3. `e2e` runs.
4. `deploy` (`needs: [quality, e2e]`, `v*` tags only) publishes that artifact with
   `actions/deploy-pages`. Its environment is `github-pages`; the run summary links the URL.

A red `quality` or `e2e` means **no deploy** — the previous deployment stays live; fix it and
push a new tag (don't move a published tag). There is no staging environment; PR and `main`
runs never deploy anything. The live version is always the newest green tag:
`git describe --tags --abbrev=0 origin/main` is only a hint — a hotfix tag may sit off `main`.

## Hotfix (production is behind `main`)

When `main` carries unreleased work (e.g. a half-built epic) and production needs a fix:

```bash
git fetch --tags
git switch -c fix/<name> v1.2.0        # branch from the LIVE tag, not from main
# ...commit the fix...
git push -u origin fix/<name>
gh pr create --base main --head fix/<name>   # CI gates the fix on top of current main
git tag -a v1.2.1 -m "v1.2.1" fix/<name>     # tag the fix branch head, not main
git push origin v1.2.1                       # CI gates it on top of v1.2.0, then deploys
```

Then merge the PR into `main` (merge commit — no cherry-pick, so the same commits live in
both), and the fix rides the next release from `main` automatically. CI runs twice on purpose:
the fix has to be green on both bases. A conflict on the PR is resolved there; production is
unaffected.

Propagation after a green `deploy` is usually under a minute. Browsers may cache the previous
`index.html` briefly; a hard reload settles it.

## Rollback

There is no "previous version" button in Pages. To roll back:

- **Emergency:** Actions → the `CI` run of the **previous release tag** → **Re-run all jobs**.
  It rebuilds and redeploys that tag. Then fix forward.
- **Preferred:** fix or revert on a branch from the live tag and release a patch tag — the
  hotfix procedure above. (A revert merged to `main` alone no longer deploys.)

## Troubleshooting

| Symptom | Likely cause | Check |
| --- | --- | --- |
| Deploy job fails with "Get Pages site failed" | Pages disabled / source not "GitHub Actions" | Settings → Pages; the `gh api` command above returns 404 |
| Site serves `sidiar.github.io/...` or GitHub 404 | `CNAME` missing from `out/` | `apps/web/public/CNAME` exists and contains the domain |
| Certificate error / Enforce HTTPS greyed out | Cloudflare proxy turned on, or A records changed | `dig +short A game-of-life-studio.com` returns the four `185.199.*` IPs, not `104.*`/`172.67.*` |
| Domain unreachable everywhere | Registration lapsed | Cloudflare dashboard → Domain Registration |
| Green run, stale content | Browser cache | Hard reload; `curl -sI https://game-of-life-studio.com` shows fresh `etag` |

## Changelog

| Date       | Change |
| ---------- | ------ |
| 2026-09-14 | Domain registered on Cloudflare Registrar. DNS records added (proxy off). Account-level domain verification TXT added. |
| 2026-09-14 | Pages enabled (source: GitHub Actions), custom domain bound, Enforce HTTPS on. PR #30 merged: `deploy` job + `CNAME`. First deploy live. |
| 2026-09-29 | Deploy moved from `main` pushes to `v*` release tags, so `main` can carry Epic 6 in progress. `github-pages` environment: `v*` tag policy added. |
