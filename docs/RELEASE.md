# AnswerCue Release Process

This app ships through GitHub Releases from the `FarzamHejaziK/AnswerCue`
release channel. The update metadata must point to this repository so installed
apps never read update notes or installers from the upstream project.

## Release Checklist

1. Update the version in `package.json` and `package-lock.json`.
2. Add a top entry to `CHANGELOG.md`.
3. Add a release body under `.github/releases/vX.Y.Z.md`.
4. Commit the app, docs, icon, and workflow changes.
5. Push `main` and a matching `vX.Y.Z` tag, then immediately create the draft release with its release notes.
6. Let GitHub Actions build, verify signing, and attach platform installers to the draft.
7. Verify both workflows succeeded and the draft contains all artifacts below before publishing it as latest.

## Platform Artifacts

| Platform | Artifact | Notes |
| --- | --- | --- |
| macOS Apple Silicon | `AnswerCue-X.Y.Z-arm64.dmg`, `AnswerCue-X.Y.Z-arm64-mac.zip` | Developer ID signed, notarized, and stapled |
| macOS Intel | `AnswerCue-X.Y.Z.dmg`, `AnswerCue-X.Y.Z-mac.zip` | Developer ID signed, notarized, and stapled |
| macOS update metadata | `latest-mac.yml` | Used by Electron updater |
| Windows Intel/AMD x64 | `AnswerCue-Setup-X.Y.Z.exe` | Azure-signed NSIS installer and updater target |
| Windows update metadata | `latest.yml` | Used by Electron updater |

Include generated blockmaps. The current release workflows do not produce Linux,
Windows ARM64, or Windows 32-bit installers.

## Creating A Release

```bash
npm version X.Y.Z --no-git-tag-version

git add package.json package-lock.json CHANGELOG.md .github/releases/vX.Y.Z.md
git commit -m "Release AnswerCue vX.Y.Z"
git tag vX.Y.Z
git push --atomic origin main vX.Y.Z
gh release create vX.Y.Z \
  --repo FarzamHejaziK/AnswerCue \
  --verify-tag --draft \
  --title "AnswerCue vX.Y.Z" \
  --notes-file .github/releases/vX.Y.Z.md
```

After checking workflow results, signing verification, platform assets, and
updater manifest hashes, publish the draft:

```bash
gh release edit vX.Y.Z --repo FarzamHejaziK/AnswerCue --draft=false --latest
```

Do not publish partial or failed platform builds as the latest release.

## Update Behavior

AnswerCue checks the GitHub Releases feed for newer versions. Updates are shown
inside the app as a quiet sidebar row, not as a modal promotion. Clicking the row
downloads the newest installer/update metadata from the AnswerCue release
channel.

Signed macOS builds can use the standard Electron updater flow. Tagged macOS
releases must pass signing and notarization checks; do not distribute an unsigned
fallback or ask users to bypass Gatekeeper to compensate for a failed release.

Windows uses the NSIS installer and `latest.yml` metadata for in-place updates.
Tagged Windows releases require Azure signing configuration and valid Authenticode
signatures on the packaged app and installer before upload.

## Versioning

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
MAJOR.MINOR.PATCH-beta.N
```

Examples:

```text
2.7.3
2.8.0
3.0.0-beta.1
```

Stable public builds should use a plain version. Pre-release builds should be
marked as pre-release on GitHub.
