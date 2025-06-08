# Release Process Documentation

## Overview

The BLE Gateway MQTT Proxy uses a **two-step release workflow** that eliminates race conditions and ensures clean version management through automated CI/CD pipelines.

## Quick Start

```bash
# Step 1: Prepare release (creates version bump PR)
npm run prepare-release

# Step 2: After merging PR, create release tag
npm run release
```

## Two-Step Release Workflow

### Step 1: Prepare Release

```bash
npm run prepare-release
```

This script:
- ✅ Validates you're on `main` branch and up-to-date
- ✅ Runs all tests to ensure quality
- ✅ Suggests next version (patch/minor/major)
- ✅ Creates a `release/vX.Y.Z` branch
- ✅ Updates `package.json` version
- ✅ Commits and pushes the branch
- ✅ Creates a PR (if GitHub CLI available)

### Step 2: Review and Merge

- Review the version bump PR
- Ensure all CI checks pass
- Merge the PR to `main`

### Step 3: Create Release Tag

```bash
npm run release
```

This script:
- ✅ Validates you're on `main` branch and up-to-date
- ✅ Runs all tests again
- ✅ Reads version from `package.json`
- ✅ Creates and pushes `tags/vX.Y.Z`
- ✅ Triggers GitHub Actions release workflow

## CI/CD Pipeline

The project uses GitHub Actions with three main workflows:

### 1. CI Workflow (`.github/workflows/ci.yml`)
**Triggers:** Pull requests, manual dispatch  
**Purpose:** Run tests, build validation, code quality checks

### 2. Docker Publish Workflow (`.github/workflows/docker-publish.yml`)
**Triggers:** Pushes to `main`/`develop` branches  
**Purpose:** Build development images with tags like `main`, `develop`, `latest`

### 3. Release Workflow (`.github/workflows/release.yml`)
**Triggers:** Git tags matching `tags/v*`  
**Purpose:** Build and publish versioned releases

## Docker Image Tagging Strategy

### Development Images
- `main` - Latest build from main branch
- `develop` - Latest build from develop branch  
- `latest` - Same as `main` (for main branch only)
- `main-<sha>` - Specific commit from main

### Release Images
For tag `tags/v1.2.3`:
- `1.2.3` - Exact version
- `1.2` - Major.minor version (updated for patch releases)
- `1` - Major version (updated for minor/patch releases)

## Version Management

### Semantic Versioning
We follow [Semantic Versioning](https://semver.org/):
- **MAJOR.MINOR.PATCH** (e.g., `1.2.3`)
- **MAJOR**: Breaking changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, backwards compatible

### Version Suggestions
The `prepare-release` script automatically suggests versions:
- **Patch** (1.2.1 → 1.2.2): Bug fixes, documentation updates
- **Minor** (1.2.1 → 1.3.0): New features, backwards compatible
- **Major** (1.2.1 → 2.0.0): Breaking changes

## Docker Image Usage

### Latest Development
```bash
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:latest
```

### Specific Versions
```bash
# Exact version
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:1.0.0

# Major.minor version (automatically updated for patch releases)
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:1.0

# Major version (automatically updated for minor/patch releases)
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:1
```

### Branch Builds
```bash
# Latest main branch
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:main

# Latest develop branch  
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:develop
```

## Benefits

### ✅ **Eliminates Race Conditions**
- Version is set in a PR before merging to main
- No version changes needed during tag creation

### ✅ **Maintains Clean History**
- Version changes go through PR review process
- Clear separation of concerns

### ✅ **Enables Automation**
- GitHub Actions triggers on the tag push
- Automated Docker building and publishing

### ✅ **Supports Collaboration**
- Team can review version bumps
- Prevents accidental releases

## Manual Override

You can also manually specify any semantic version:

```bash
# When prompted, enter a custom version like:
1.2.5
2.1.0
3.0.0-beta.1
```

## Troubleshooting

### "Working directory is not clean"
```bash
git status
git add . && git commit -m "your message"
```

### "Not up to date with origin"
```bash
git pull origin main
```

### "Tag already exists"
Update the version in `package.json` to a new version before running `npm run release`.

### "GitHub CLI not found"
The script will work without GitHub CLI, but you'll need to create the PR manually using the provided branch name and instructions.

## Example Workflow

```bash
# 1. Prepare a patch release
npm run prepare-release
# Choose option 1 (patch), confirm

# 2. Review and merge the PR on GitHub

# 3. Create the release tag  
npm run release
# Confirm the tag creation

# 4. Monitor the release at:
# https://github.com/alackmann/ble-gateway-mqtt-proxy/actions
```

## Security

All Docker images are automatically scanned for vulnerabilities using Trivy. Release builds include comprehensive security reports and will fail if critical vulnerabilities are detected.

This workflow ensures reliable, reviewable, and automated releases! 🚀

### ✅ **Maintains Clean History**
- Version changes go through PR review process
- Clear separation of concerns

### ✅ **Enables Automation**
- GitHub Actions triggers on the tag push
- Automated Docker building and publishing

### ✅ **Supports Collaboration**
- Team can review version bumps
- Prevents accidental releases

## Version Suggestions

The `prepare-release` script automatically suggests versions based on semantic versioning:

- **Patch** (1.2.1 → 1.2.2): Bug fixes, documentation updates
- **Minor** (1.2.1 → 1.3.0): New features, backwards compatible
- **Major** (1.2.1 → 2.0.0): Breaking changes

## GitHub Actions Integration

When a tag is pushed, the release workflow automatically:

1. **Builds** Docker images for multiple architectures
2. **Tags** images with semantic versions (1.2.1, 1.2, 1, latest)
3. **Publishes** to GitHub Container Registry
4. **Creates** GitHub release with changelog
5. **Scans** images for security vulnerabilities

## Manual Override

You can also manually specify any semantic version:

```bash
# When prompted, enter a custom version like:
1.2.5
2.1.0
3.0.0-beta.1
```

## Troubleshooting

### "Working directory is not clean"
```bash
git status
git add . && git commit -m "your message"
```

### "Not up to date with origin"
```bash
git pull origin main
```

### "Tag already exists"
Update the version in `package.json` to a new version before running `npm run release`.

### "GitHub CLI not found"
The script will work without GitHub CLI, but you'll need to create the PR manually using the provided branch name and instructions.

## Example Workflow

```bash
# 1. Prepare a patch release
npm run prepare-release
# Choose option 1 (patch), confirm

# 2. Review and merge the PR on GitHub

# 3. Create the release tag  
npm run release
# Confirm the tag creation

# 4. Monitor the release at:
# https://github.com/alackmann/ble-gateway-mqtt-proxy/actions
```

This workflow ensures reliable, reviewable, and automated releases! 🚀
