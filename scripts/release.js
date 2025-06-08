#!/usr/bin/env node

/**
 * Release tagging script for BLE Gateway MQTT Proxy
 * 
 * This script helps create and push release tags with proper validation:
 * - Ensures we're on the main branch
 * - Validates semantic versioning format
 * - Creates annotated git tags
 * - Pushes tags to origin
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

// Get version from package.json
function getPackageVersion() {
    try {
        const packageJsonPath = path.join(__dirname, '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const version = packageJson.version;
        
        if (!version) {
            error('No version found in package.json');
            return null;
        }
        
        // Ensure version starts with 'v'
        return version.startsWith('v') ? version : `v${version}`;
    } catch (err) {
        error('Failed to read package.json');
        error(err.message);
        return null;
    }
}

// Validate semantic version format
function isValidSemver(version) {
    const semverRegex = /^v\d+\.\d+\.\d+$/;
    return semverRegex.test(version);
}

// Check if we're on the main branch
function checkMainBranch() {
    info('Checking current branch...');
    try {
        const currentBranch = execCommand('git branch --show-current', { silent: true });
        if (currentBranch !== 'main') {
            error(`You must be on the 'main' branch to create a release. Current branch: ${currentBranch}`);
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

// Check if we have npm tests passing
function checkTests() {
    info('Running tests to ensure quality...');
    try {
        execCommand('npm test', { silent: false });
        success('All tests passed');
        return true;
    } catch (err) {
        error('Tests failed. Please fix failing tests before creating a release.');
        return false;
    }
}

// Check if tag already exists
function checkTagExists(tag) {
    try {
        execCommand(`git rev-parse ${tag}`, { silent: true });
        return true; // Tag exists
    } catch (err) {
        return false; // Tag doesn't exist
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
function suggestNextVersion() {
    try {
        const tags = execCommand('git tag -l "tags/v*" --sort=-version:refname', { silent: true });
        if (tags) {
            const latestTag = tags.split('\n')[0];
            if (latestTag) {
                const version = latestTag.replace('tags/v', '');
                const parts = version.split('.').map(Number);
                if (parts.length === 3 && parts.every(n => !isNaN(n))) {
                    const nextPatch = `v${parts[0]}.${parts[1]}.${parts[2] + 1}`;
                    const nextMinor = `v${parts[0]}.${parts[1] + 1}.0`;
                    const nextMajor = `v${parts[0] + 1}.0.0`;
                    info(`Suggested versions based on latest (${latestTag}):`);
                    log(`  Patch: ${nextPatch}`, colors.cyan);
                    log(`  Minor: ${nextMinor}`, colors.cyan);
                    log(`  Major: ${nextMajor}`, colors.cyan);
                }
            }
        }
    } catch (err) {
        // Ignore errors
    }
}

// Create and push the tag
function createAndPushTag(version) {
    const tag = `tags/${version}`;
    const message = `Release ${version} - BLE Gateway MQTT Proxy`;
    
    info(`Creating tag: ${tag}`);
    try {
        execCommand(`git tag -a "${tag}" -m "${message}"`);
        success(`Created tag: ${tag}`);
    } catch (err) {
        error(`Failed to create tag: ${tag}`);
        throw err;
    }
    
    info(`Pushing tag to origin: ${tag}`);
    try {
        execCommand(`git push origin "${tag}"`);
        success(`Pushed tag to origin: ${tag}`);
    } catch (err) {
        error(`Failed to push tag: ${tag}`);
        error('You may need to delete the local tag: git tag -d ' + tag);
        throw err;
    }
}

// Main release function
async function createRelease() {
    try {
        log('\n🚀 BLE Gateway MQTT Proxy Release Helper\n', colors.bold);
        
        // Show existing tags for reference
        showExistingTags();
        
        // Suggest next versions
        suggestNextVersion();
        
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
        
        // Get version from package.json
        const version = getPackageVersion();
        if (!version) {
            error('Unable to determine version from package.json');
            process.exit(1);
        }
        
        info(`Using version from package.json: ${version}`);
        
        if (!isValidSemver(version)) {
            error(`Invalid version format in package.json: ${version}`);
            error('Please use semantic versioning (e.g., 1.2.3) in package.json');
            process.exit(1);
        }
        
        // Check if tag already exists
        const tag = `tags/${version}`;
        if (checkTagExists(tag)) {
            error(`Tag ${tag} already exists`);
            error('Please update the version in package.json to a new version');
            process.exit(1);
        }
        
        // Show release summary
        log(`\n📋 Release Summary:`, colors.bold);
        log(`   Version: ${version} (from package.json)`, colors.cyan);
        log(`   Tag: tags/${version}`, colors.cyan);
        log(`   Branch: main`, colors.cyan);
        
        const confirm = await question('\n❓ Proceed with creating and pushing this tag? (y/N): ');
        
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            warning('Release cancelled by user');
            process.exit(0);
        }
        
        // Create and push the tag
        createAndPushTag(version);
        
        log('\n🎉 Release tag created successfully!', colors.green + colors.bold);
        log('\nNext steps:', colors.bold);
        log('1. The GitHub Actions release workflow will automatically trigger');
        log('2. Docker images will be built and published to GitHub Container Registry');
        log('3. A GitHub release will be created automatically');
        log('4. Security scans will be performed on the images');
        log('\n🔗 Monitor the progress at:');
        log('   https://github.com/alackmann/ble-gateway-mqtt-proxy/actions', colors.blue);
        
    } catch (err) {
        error('\nRelease process failed');
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    log('\n\n👋 Release cancelled by user', colors.yellow);
    rl.close();
    process.exit(0);
});

// Run the release process
createRelease();
