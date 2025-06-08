# CI/CD and Release Process

This document describes the automated CI/CD pipeline and release process for the BLE Gateway MQTT Proxy.

## Overview

The project uses GitHub Actions for automated testing, building, and publishing Docker images. There are three main workflows:

### 1. CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch

**Purpose:**
- Run automated tests
- Build and test Docker images
- Validate code quality

### 2. Docker Publish Workflow (`.github/workflows/docker-publish.yml`)

**Triggers:**
- Pushes to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Purpose:**
- Build and publish Docker images for development
- Tag images with branch names
- Publish `latest` tag for `main` branch builds
- Run security scans

**Docker Tags Created:**
- `main` - Latest build from main branch
- `develop` - Latest build from develop branch  
- `latest` - Same as `main` (only for main branch)
- `main-<sha>` - Specific commit from main
- `develop-<sha>` - Specific commit from develop

### 3. Release Workflow (`.github/workflows/release.yml`)

**Triggers:**
- Git tags matching `tags/v*` (e.g., `tags/v1.0.0`)
- Git tags matching `v*` (e.g., `v1.0.0`)

**Purpose:**
- Build and publish versioned Docker images
- Create GitHub releases
- Run security scans on release images

**Docker Tags Created:**
For a tag `tags/v1.2.3`, the following Docker tags are created:
- `1.2.3` - Exact version
- `1.2` - Major.minor version  
- `1` - Major version

## Release Process

### Automated Release Helper

The project includes an automated release helper script that simplifies the tagging process:

```bash
npm run release
```

**The script will:**
1. **Validate environment**: Ensure you're on the `main` branch
2. **Check repository state**: Verify working directory is clean and up-to-date
3. **Show existing tags**: Display recent release tags for reference
4. **Prompt for version**: Ask for the new version in `v1.2.3` format
5. **Validate version**: Ensure semantic versioning format and no duplicate tags
6. **Create annotated tag**: Create `tags/v1.2.3` with descriptive message
7. **Push to origin**: Automatically push the tag to trigger CI/CD

**Example usage:**
```bash
$ npm run release

🚀 BLE Gateway MQTT Proxy Release Helper

ℹ️  Existing release tags:
  tags/v1.1.0
  tags/v1.0.0

✅ On main branch
✅ Working directory is clean  
✅ Branch is up to date with origin

📝 Enter the version to tag (format: v1.2.3): v1.2.0

📋 Release Summary:
   Version: v1.2.0
   Tag: tags/v1.2.0
   Branch: main

❓ Proceed with creating and pushing this tag? (y/N): y

✅ Created tag: tags/v1.2.0
✅ Pushed tag to origin: tags/v1.2.0

🎉 Release tag created successfully!
```

### Manual Release Process

1. **Ensure all tests pass** on the `main` branch
2. **Create a version tag** using the format `tags/v<version>`:
   ```bash
   git tag -a tags/v1.0.0 -m "Release v1.0.0"
   git push origin tags/v1.0.0
   ```

3. **Automatic actions triggered:**
   - Release workflow runs automatically
   - Docker images are built and published
   - GitHub release is created with release notes
   - Security scan is performed

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- `MAJOR.MINOR.PATCH` (e.g., `1.2.3`)
- **MAJOR**: Breaking changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, backwards compatible

### Docker Image Usage

#### Latest Development Build
```bash
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:latest
```

#### Specific Version
```bash
# Exact version
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:1.0.0

# Major.minor version (automatically updated for patch releases)
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:1.0

# Major version (automatically updated for minor/patch releases)
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:1
```

#### Branch Builds
```bash
# Latest main branch
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:main

# Latest develop branch  
docker pull ghcr.io/andrelackmann/ble-gateway-mqtt-proxy:develop
```

## Security

- **Vulnerability Scanning**: All images are scanned with Trivy
- **Multi-platform Builds**: Images are built for `linux/amd64` and `linux/arm64`
- **Minimal Base Image**: Uses Alpine Linux for smaller attack surface
- **No Secrets in Images**: All configuration via environment variables

## Monitoring

- **GitHub Actions**: Monitor workflow status in the Actions tab
- **Docker Registry**: Images available at `ghcr.io/andrelackmann/ble-gateway-mqtt-proxy`
- **Security Alerts**: Vulnerability scan results in GitHub Security tab
- **Release Notes**: Automatically generated for each release

## Troubleshooting

### Failed Release Build
1. Check the release workflow logs in GitHub Actions
2. Ensure the tag follows the correct format (`tags/v*`)
3. Verify all tests pass before tagging

### Docker Image Not Available
1. Check if the workflow completed successfully
2. Verify GitHub Container Registry permissions
3. Wait a few minutes for registry propagation

### Security Scan Failures
1. Security scans are informational and don't block releases
2. Review findings in the GitHub Security tab
3. Address critical vulnerabilities in future releases
