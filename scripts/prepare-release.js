#!/usr/bin/env node

/**
 * Prepare Release script for BLE Gateway MQTT Proxy
 * 
 * This script creates a version bump PR with proper validation:
 * - Ensures we're on the main branch and up to date
 * - Suggests next version based on existing tags
 * - Creates a release branch with version bump
 * - Creates a PR for review
 */

const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
    log(`❌ ${message}`, colors.red);
}

function success(message) {
    log(`✅ ${message}`, colors.green);
}

function info(message) {
    log(`ℹ️  ${message}`, colors.blue);
}

function warning(message) {
    log(`⚠️  ${message}`, colors.yellow);
}

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Promisify readline question
function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

// Execute shell command and return output
function execCommand(command, options = {}) {
    try {
        const result = execSync(command, { 
            encoding: 'utf8', 
            stdio: options.silent ? 'pipe' : 'inherit',
            ...options 
        });
        // Handle null/undefined results safely
        return result ? result.toString().trim() : '';
    } catch (err) {
        if (!options.silent) {
            error(`Command failed: ${command}`);
            error(err.message);
        }
        throw err;
    }
}

// Get current version from package.json
function getCurrentVersion() {
    try {
        const packageJsonPath = path.join(__dirname, '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version;
    } catch (err) {
        error('Failed to read package.json');
        return null;
    }
}

// Update version in package.json
function updatePackageVersion(version) {
    try {
        const packageJsonPath = path.join(__dirname, '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        packageJson.version = version;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        success(`Updated package.json version to ${version}`);
        return true;
    } catch (err) {
        error('Failed to update package.json');
        error(err.message);
        return false;
    }
}

// Validate semantic version format
function isValidSemver(version) {
    const semverRegex = /^\d+\.\d+\.\d+$/;
    return semverRegex.test(version);
}

// Check if we're on the main branch
function checkMainBranch() {
    info('Checking current branch...');
    try {
        const currentBranch = execCommand('git branch --show-current', { silent: true });
        if (currentBranch !== 'main') {
            error(`You must be on the 'main' branch to prepare a release. Current branch: ${currentBranch}`);
            error('Please switch to main: git checkout main');
            return false;
        }
        success('On main branch');
        return true;
    } catch (err) {
        error('Failed to check current branch. Are you in a git repository?');
        return false;
    }
}

// Check if working directory is clean
function checkWorkingDirectory() {
    info('Checking working directory...');
    try {
        const status = execCommand('git status --porcelain', { silent: true });
        if (status.length > 0) {
            error('Working directory is not clean. Please commit or stash your changes.');
            log('Uncommitted changes:', colors.yellow);
            console.log(status);
            return false;
        }
        success('Working directory is clean');
        return true;
    } catch (err) {
        error('Failed to check git status');
        return false;
    }
}

// Check if we're up to date with origin
function checkUpToDate() {
    info('Checking if branch is up to date with origin...');
    try {
        // Fetch latest from origin
        execCommand('git fetch origin', { silent: true });
        
        const localCommit = execCommand('git rev-parse HEAD', { silent: true });
        const remoteCommit = execCommand('git rev-parse origin/main', { silent: true });
        
        if (localCommit !== remoteCommit) {
            error('Your local main branch is not up to date with origin/main');
            error('Please run: git pull origin main');
            return false;
        }
        success('Branch is up to date with origin');
        return true;
    } catch (err) {
        warning('Could not check if branch is up to date with origin');
        return true; // Continue anyway
    }
}

// Check if tests pass
function checkTests() {
    info('Running tests to ensure quality...');
    try {
        execCommand('npm test', { silent: false });
        success('All tests passed');
        return true;
    } catch (err) {
        error('Tests failed. Please fix failing tests before preparing a release.');
        return false;
    }
}

// Get existing tags for reference
function showExistingTags() {
    try {
        const tags = execCommand('git tag -l "tags/v*" --sort=-version:refname', { silent: true });
        if (tags) {
            info('Existing release tags:');
            tags.split('\n').slice(0, 5).forEach(tag => {
                log(`  ${tag}`, colors.cyan);
            });
            if (tags.split('\n').length > 5) {
                log(`  ... and ${tags.split('\n').length - 5} more`, colors.cyan);
            }
        } else {
            info('No existing release tags found');
        }
    } catch (err) {
        // Ignore errors when listing tags
    }
}

// Suggest next version based on existing tags
function suggestNextVersions() {
    const currentVersion = getCurrentVersion();
    if (!currentVersion) return [];
    
    const parts = currentVersion.split('.').map(Number);
    if (parts.length !== 3 || parts.some(n => isNaN(n))) return [];
    
    const nextPatch = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    const nextMinor = `${parts[0]}.${parts[1] + 1}.0`;
    const nextMajor = `${parts[0] + 1}.0.0`;
    
    info(`Current version: ${currentVersion}`);
    info('Suggested next versions:');
    log(`  1. Patch: ${nextPatch} (bug fixes)`, colors.cyan);
    log(`  2. Minor: ${nextMinor} (new features)`, colors.cyan);
    log(`  3. Major: ${nextMajor} (breaking changes)`, colors.cyan);
    
    return [nextPatch, nextMinor, nextMajor];
}

// Check if GitHub CLI is available
function checkGitHubCLI() {
    try {
        execCommand('gh --version', { silent: true });
        return true;
    } catch (err) {
        warning('GitHub CLI (gh) not found. PR creation will be skipped.');
        warning('Install GitHub CLI: https://cli.github.com/');
        return false;
    }
}

// Check if branch exists
function branchExists(branchName) {
    try {
        execCommand(`git rev-parse --verify ${branchName}`, { silent: true });
        return true;
    } catch (err) {
        return false;
    }
}

// Main prepare release function
async function prepareRelease() {
    try {
        log('\n🚀 BLE Gateway MQTT Proxy - Prepare Release\n', colors.bold);
        
        // Show existing tags for reference
        showExistingTags();
        
        // Pre-flight checks
        if (!checkMainBranch()) {
            process.exit(1);
        }
        
        if (!checkWorkingDirectory()) {
            process.exit(1);
        }
        
        if (!checkUpToDate()) {
            process.exit(1);
        }
        
        // Run tests to ensure quality
        if (!checkTests()) {
            process.exit(1);
        }
        
        // Suggest versions and get user input
        const suggestions = suggestNextVersions();
        
        let version;
        while (true) {
            const input = await question('\n📝 Enter the new version (e.g., 1.2.3) or choose 1/2/3 from suggestions: ');
            
            if (input === '1' && suggestions[0]) {
                version = suggestions[0];
                break;
            } else if (input === '2' && suggestions[1]) {
                version = suggestions[1];
                break;
            } else if (input === '3' && suggestions[2]) {
                version = suggestions[2];
                break;
            } else if (isValidSemver(input)) {
                version = input;
                break;
            } else {
                error('Please enter a valid semantic version (e.g., 1.2.3) or choose 1/2/3');
            }
        }
        
        const branchName = `release/v${version}`;
        
        // Check if release branch already exists
        if (branchExists(branchName)) {
            error(`Release branch ${branchName} already exists`);
            error('Please delete it first: git branch -D ' + branchName);
            process.exit(1);
        }
        
        // Show release summary
        log(`\n📋 Release Preparation Summary:`, colors.bold);
        log(`   New Version: ${version}`, colors.cyan);
        log(`   Release Branch: ${branchName}`, colors.cyan);
        log(`   Current Branch: main`, colors.cyan);
        
        const confirm = await question('\n❓ Proceed with creating release branch and PR? (y/N): ');
        
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            warning('Release preparation cancelled by user');
            process.exit(0);
        }
        
        // Create release branch
        info(`Creating release branch: ${branchName}`);
        execCommand(`git checkout -b ${branchName}`);
        success(`Created and switched to branch: ${branchName}`);
        
        // Update package.json version
        if (!updatePackageVersion(version)) {
            process.exit(1);
        }
        
        // Commit the version bump
        info('Committing version bump...');
        execCommand('git add package.json');
        execCommand(`git commit -m "chore: bump version to v${version}"`);
        success('Version bump committed');
        
        // Push the branch
        info('Pushing release branch to origin...');
        execCommand(`git push origin ${branchName}`);
        success('Release branch pushed to origin');
        
        // Create PR if GitHub CLI is available
        const hasGHCLI = checkGitHubCLI();
        if (hasGHCLI) {
            try {
                info('Creating pull request...');
                const prTitle = `Release v${version}`;
                const prBody = `## 🚀 Release v${version}

This PR bumps the version to **v${version}** in preparation for release.

### 📋 Changes
- ✅ Updated \`package.json\` version to \`${version}\`
- ✅ All tests are passing
- ✅ Branch is up to date with main

### 🔄 Release Process
1. **Review and merge** this PR into \`main\`
2. **Create release tag** by running: \`npm run release\`
3. **Automated deployment** via GitHub Actions will:
   - Build and publish Docker images to GitHub Container Registry
   - Create GitHub release with changelog
   - Run security scans on published images

### ✅ Pre-Release Checklist
- [x] Version follows semantic versioning
- [x] All tests pass
- [x] Working directory is clean
- [x] Branch is up to date with origin
- [ ] PR reviewed and approved
- [ ] Ready to merge and release

### 🔗 Next Steps
After merging this PR:
1. Switch to \`main\` branch: \`git checkout main && git pull\`
2. Create release: \`npm run release\`
3. Monitor the [Actions workflow](https://github.com/alackmann/ble-gateway-mqtt-proxy/actions)`;
                
                execCommand(`gh pr create --title "${prTitle}" --body "${prBody}"`);
                success('Pull request created successfully!');
            } catch (err) {
                warning('Failed to create PR automatically. You can create it manually.');
            }
        }
        
        // Switch back to main
        info('Switching back to main branch...');
        execCommand('git checkout main');
        success('Switched back to main branch');
        
        log('\n🎉 Release preparation completed successfully!', colors.green + colors.bold);
        log('\nNext steps:', colors.bold);
        log('1. Review the pull request and merge it when ready');
        log('2. After merging, run: npm run release');
        log('3. The release workflow will automatically trigger');
        
        if (hasGHCLI) {
            log('\n🔗 View the pull request:');
            try {
                const prUrl = execCommand('gh pr view --json url -q .url', { silent: true });
                log(`   ${prUrl}`, colors.blue);
            } catch (err) {
                log('   Check GitHub for the new PR', colors.blue);
            }
        } else {
            log('\n🔗 Manually create a PR:');
            log(`   From: ${branchName}`, colors.cyan);
            log(`   To: main`, colors.cyan);
            log(`   Title: Release v${version}`, colors.cyan);
        }
        
    } catch (err) {
        error('\nRelease preparation failed');
        console.error(err);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    log('\n\n👋 Release preparation cancelled by user', colors.yellow);
    rl.close();
    process.exit(0);
});

// Run the release preparation process
prepareRelease();
