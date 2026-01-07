# Branch-Commit-PR Workflow Skill

This skill automates the complete git workflow from creating a feature branch to opening a pull request.

## Overview

This skill performs the following steps:
1. Creates a feature branch following Conventional Branch naming
2. **Performs security check to prevent sensitive information leaks** (CRITICAL)
3. Creates commits using the commit skill
4. Opens a pull request using GitHub CLI

## Instructions

You are a git workflow assistant that helps developers create branches, commits, and pull requests following best practices.

### Step 1: Analyze Current Repository State

Before starting the workflow, gather information about the repository:

1. Run `git status` to check for uncommitted changes
2. Run `git branch --show-current` to identify the current branch
3. Run `git remote -v` to verify remote repository configuration
4. Check if `gh auth status` is configured properly

If there are uncommitted changes on the current branch:
- Automatically stash them: `git stash save "WIP: Auto-stashed before branch creation"`
- Continue with the workflow
- Note: User can restore changes later with `git stash pop` if needed

### Step 2: Create Feature Branch

#### Determine Branch Name from Context

Analyze the user's request and conversation context to determine:
- **Change type**: feat, fix, docs, refactor, test, or chore
- **Description**: Brief description of the change

Following [Conventional Branch](https://conventional-branch.github.io/) naming:

Format: `<type>/<description>`

Examples:
- `feat/user-authentication`
- `fix/login-error-handling`
- `docs/api-documentation`
- `refactor/database-queries`
- `test/unit-tests-auth`
- `chore/update-dependencies`

Generate branch name automatically based on:
1. Explicit branch name in user's message (if provided)
2. Task description and change type
3. Current uncommitted changes (if analyzing file diffs)

#### Create and Switch to Branch

```bash
# Create and switch to new branch
git switch -c <branch-name>

# Verify branch creation
git branch --show-current
```

### Step 3: Make Changes and Create Commits

#### Determine Current State

Check if there are already commits on the branch or if changes need to be committed:

```bash
# Check for commits on current branch
git log origin/main..HEAD --oneline

# Check for uncommitted changes
git status
```

#### Handle Different Scenarios

Based on the current state:

1. **No commits and no changes**:
   - Inform user that branch is empty
   - Wait for user to make changes or provide implementation instructions

2. **No commits but changes exist**:
   - Automatically proceed to commit creation
   - Call the commit skill

3. **Commits already exist**:
   - Skip commit creation
   - Proceed directly to pushing and PR creation

#### Security Check: Prevent Sensitive Information Leaks

**CRITICAL**: Before creating any commits, ALWAYS perform a security check to prevent sensitive information from being committed and pushed to the repository.

**IMPORTANT**: This check only examines **filenames**, not file contents, to protect user privacy and avoid exposing sensitive data to the AI.

##### Get List of Files to be Committed

```bash
git diff --staged --name-only
```

##### Sensitive File Patterns to Detect

Check for the following filename patterns that commonly contain sensitive information:

**Environment and Configuration Files**:
- `.env`, `.env.local`, `.env.production`, `.env.development`, `.env.*`
- `*.credentials`, `credentials.*`, `credentials`
- `secrets.yaml`, `secrets.yml`, `secrets.json`, `secrets.toml`, `*.secret.*`
- `.aws/credentials`, `.aws/config`

**Authentication and Keys**:
- `*.pem`, `*.key`, `*.p12`, `*.pfx` (private keys, certificates)
- `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519` (SSH private keys)
- `.ssh/id_*`, `.ssh/known_hosts`
- `*.keystore`, `*.jks` (Java keystores)
- `*.crt`, `*.cer` (may be private certificates)

**Token and Password Files**:
- Files containing `token`, `password`, `passwd`, `secret`, `apikey` in the name
- `.netrc`, `.npmrc` (often contain auth tokens)
- `.pypirc` (Python package index credentials)
- `auth.json`, `auth.yaml`

**Database and Service Credentials**:
- `database.yml`, `database.yaml` (Rails-style config)
- `.pgpass`, `.my.cnf` (PostgreSQL/MySQL passwords)

##### Security Check Process

1. **Get all staged filenames**:
```bash
git diff --staged --name-only
```

2. **Check each filename against sensitive patterns**:
   - Match against the patterns listed above
   - Use basename and full path for checking

3. **If sensitive filename detected**:
   - **IMMEDIATELY ABORT** the workflow
   - Display clear warning message:
     ```
     ⚠️  SECURITY WARNING: Sensitive files detected!

     The following files appear to be sensitive and should NOT be committed:
     - <filename>: Matches pattern '<pattern>' (e.g., *.env, *.key, credentials.*)

     These files commonly contain sensitive information like API keys, passwords, or private keys.

     Recommended actions:
     1. Remove from staging: git reset HEAD <filename>
     2. Add to .gitignore: echo "<filename>" >> .gitignore
     3. Use environment variables or secret management tools instead
     4. Review your .gitignore to prevent future accidents

     Workflow ABORTED for your security.
     ```
   - Do NOT proceed with commit or push
   - Wait for user to fix the issue

4. **If no sensitive filenames detected**:
   - Proceed with commit creation

##### Important Security Notes

- **Only filenames are checked** - file contents are never read to protect privacy
- **NEVER commit files matching sensitive patterns** even if user insists
- **ALWAYS check before EVERY commit**
- **ABORT immediately** upon detection - do not ask for confirmation
- **Protect the user** from accidentally exposing credentials
- This is a **critical security requirement** that must not be bypassed
- Users should also consider using git hooks (pre-commit, git-secrets, gitleaks) for additional protection

#### Create Commits

If there are uncommitted changes AND security check passes, call the commit skill:

```
call commit skill
```

This will analyze the changes and create appropriate commits following the project's conventions.

After commits are created:
1. Run `git log --oneline -5` to show recent commits
2. Run `git status` to verify clean state

### Step 4: Push Branch to Remote

Before pushing, verify:

```bash
# Check if branch has commits
git log origin/main..HEAD --oneline

# Push branch to remote
git push -u origin <branch-name>
```

If push fails due to authentication or permissions, provide guidance on fixing the issue.

### Step 5: Create Pull Request

#### Analyze Changes for PR Information

Generate PR title and description automatically by:

1. Analyzing all commits on the branch:
```bash
git log origin/main..HEAD --format='%s'
git diff origin/main...HEAD --stat
```

2. Determining PR title:
   - If single commit: Use the commit message
   - If multiple commits: Use branch name formatted as title
   - Example: `feat/user-auth` → "Add user authentication feature"

3. Creating a structured description:
   - Summary of changes
   - List of commits included
   - Testing checklist
   - File changes summary

#### Create the PR

Use GitHub CLI to create the pull request automatically:

```bash
gh pr create \
  --title "<auto-generated-title>" \
  --body "$(cat <<'EOF'
## Summary
<Brief description based on commits and changes>

## Changes
<List of commits included>

## Modified Files
<Summary of file changes from git diff --stat>

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Documentation updated if needed

---
Created with Branch-Commit-PR workflow skill
EOF
)" \
  --base main \
  --head <branch-name>
```

The PR is created as a regular (non-draft) PR by default.

### Step 6: Post-PR Actions

After successful PR creation:

1. Show the PR URL to the user
2. Display PR number and link
3. Inform user that the workflow is complete

## Error Handling

### Common Issues and Solutions

1. **SECURITY: Sensitive information detected** (HIGHEST PRIORITY)
   - **IMMEDIATELY ABORT** the workflow
   - Display detailed warning with affected files
   - Provide remediation steps (.gitignore, unstage files)
   - **DO NOT** proceed under any circumstances
   - Wait for user to manually fix and restart workflow

2. **Uncommitted changes exist**
   - Automatically stash: `git stash save "WIP: Auto-stashed before branch creation"`
   - Continue with workflow

3. **Branch already exists**
   - Inform user and abort workflow
   - Suggest using `git switch <existing-branch>` or choosing different name

4. **No GitHub authentication**
   - Detect with `gh auth status`
   - Inform user to run `gh auth login`
   - Abort workflow until authentication is configured

5. **No remote repository**
   - Check if origin is configured
   - Inform user to add remote: `git remote add origin <url>`
   - Abort workflow

6. **Conflicts with main branch**
   - Detect conflicts during push
   - Inform user to resolve conflicts manually
   - Suggest: `git fetch origin main && git rebase origin/main`

## Important Notes

### Security (HIGHEST PRIORITY)
- **CRITICAL**: ALWAYS perform security check before ANY commit
- **NEVER commit sensitive information** (API keys, passwords, tokens, private keys, credentials)
- **IMMEDIATELY ABORT** if sensitive patterns detected - no exceptions
- **PROTECT the user** from accidentally exposing secrets to version control
- This security check is **NON-NEGOTIABLE** and must be performed every time

### Workflow Execution
- NEVER use `AskUserQuestion` during the workflow execution
- AUTOMATICALLY proceed through each step when conditions are met
- VERIFY each step completes successfully before proceeding
- PRESERVE any existing work (automatically stash if needed)
- FOLLOW the project's existing conventions
- CHECK authentication and permissions before operations
- ABORT workflow if critical errors occur and inform user of the issue

## Example Usage

**Example 1**: User: "Create a feature branch for adding user authentication and make a PR"

The skill will:
1. Check repository state
2. Automatically determine branch type (feat) and name (feat/user-authentication)
3. Create and switch to new branch using `git switch -c`
4. Wait for user to make changes or help implement if requested
5. Automatically create commits using commit skill
6. Push branch to remote automatically
7. Create PR with auto-generated title and description
8. Provide PR URL

**Example 2**: User: "Fix the login bug" (with changes already made)

The skill will:
1. Check repository state and detect uncommitted changes
2. Automatically stash existing changes if on main branch
3. Create fix/login-bug branch and switch to it
4. Restore stashed changes
5. Automatically create commits using commit skill
6. Push and create PR automatically

**Example 3**: User: "/branch-commit-pr" (with commits already on current branch)

The skill will:
1. Detect existing commits on current branch
2. Skip commit creation step
3. Push branch to remote
4. Create PR based on existing commits

## Dependencies

This skill requires:
- Git configured with user name and email
- GitHub CLI (`gh`) installed and authenticated
- The `commit` skill available
- Push permissions to the repository