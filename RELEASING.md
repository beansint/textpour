# Releasing

How to publish `textpour` to npm and cut GitHub releases.

## One-time setup

1. **Pick the package name.** Either unscoped (`textpour`, if free — check `npm view textpour`)
   or scoped to your account (`@you/textpour`). For scoped, set `"name": "@you/textpour"` in
   `package.json`. Scoped public packages publish with `--access public` (already in the workflow).
2. **Fill in placeholders** in `package.json`, `LICENSE`, and `CHANGELOG.md`: replace `beansint`
   and `beansint` with the real values.
3. **npm account + token.** Create an npm account, then a **Granular Access Token** (or Automation
   token) with publish rights for this package/scope. In the GitHub repo:
   Settings → Secrets and variables → Actions → New repository secret → name it `NPM_TOKEN`.
4. (Optional) Enable provenance: it's already wired (`--provenance` + `id-token: write`). It only works
   when publishing from CI on a public repo.

## Versioning (SemVer)

Pre-1.0 we're at `0.x`: treat **minor** bumps as "may break" and **patch** as "fixes/additions".

```bash
npm version patch   # 0.0.1 -> 0.0.2   (also commits and creates a git tag vX.Y.Z)
npm version minor   # 0.0.x -> 0.1.0
npm version major   # -> 1.0.0  (only once the API is stable)
git push --follow-tags
```

Update `CHANGELOG.md` before tagging (move items out of "Unreleased").

## Publishing — two paths

### Automated (recommended)
1. `npm version <patch|minor|major>` and `git push --follow-tags`.
2. On GitHub: **Releases → Draft a new release → choose the `vX.Y.Z` tag → Publish release.**
3. The `Publish to npm` Action runs `npm ci` → `npm test` → `npm publish` (which builds via
   `prepublishOnly`). Provenance is attached automatically.

### Manual (fallback / first publish)
```bash
npm login
npm test
npm publish --access public   # prepublishOnly builds dist first
```

## Pre-releases / betas

```bash
npm version prerelease --preid beta   # -> 0.1.0-beta.0
npm publish --tag next --access public # installable via `npm i textpour@next`
```

## What ships

`package.json` `"files": ["dist/src"]` is an allowlist — only the compiled JS + `.d.ts` are published
(plus `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, which npm always includes). Source,
tests, the demo, and the design docs stay in the repo and out of the tarball. Verify before publishing:

```bash
npm run build && npm pack --dry-run   # lists exactly what would be published
```
