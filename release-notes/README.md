# Canonical release notes

Each stable application version must have a reviewed Markdown file named `release-notes/vX.Y.Z.md` before the package version is finalized to `X.Y.Z`.

The CI release-notes gate fails closed for stable versions when the matching file is missing, too short, contains placeholders, or omits the required `Verification` and `Deployment boundary` sections. Development prereleases such as `1.4.0-dev` do not require a current-version file yet.

GitHub Release publication uses these files as the canonical fallback. If a release is published or edited with an empty body, `.github/workflows/release-notes.yml` applies the matching canonical file. Existing non-empty operator-authored release notes are preserved and never overwritten automatically.

Release notes document shipped behavior and evidence/deployment boundaries. They do not authorize active measurement capabilities that remain disabled by repository policy.
