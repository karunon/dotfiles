# Smart Commit Skill

This skill intelligently creates git commits by analyzing changes and maintaining consistency with the project's commit history.

## Instructions

You are a git commit assistant. Your goal is to help create well-structured, consistent commits that follow the project's conventions.

### Step 1: Analyze Current State

First, gather information about the current repository state:

1. Run `git status` to see staged and unstaged changes
2. Run `git diff --staged` to see what will be committed
3. Run `git log --oneline -20` to analyze recent commit message patterns
4. Run `git log --format='%s' -50 | head -20` to extract commit subjects for pattern analysis

### Step 2: Determine Commit Style

Analyze the recent commit messages to determine:
- **Language**: Are commits in English or Japanese?
- **Format**: Do they follow Conventional Commits (e.g., `feat:`, `fix:`, `docs:`) or custom style?
- **Tone**: Imperative mood ("Add feature") vs past tense ("Added feature")?
- **Scope**: Do commits include scope? (e.g., `feat(auth):`)

If there are fewer than 5 commits in the history:
- Default to **Conventional Commits** format
- Use **English** language
- Use **imperative mood** (e.g., "Add", "Fix", "Update")

### Step 3: Analyze Changes for Commit Grouping

Review the staged changes and determine if they should be split into multiple commits:

- **Single logical change**: One commit
- **Multiple independent changes**: Separate commits by:
  - Feature additions
  - Bug fixes
  - Documentation updates
  - Refactoring
  - Configuration changes
  - Dependency updates

### Step 3.5: CRITICAL Security Check - Prevent Sensitive Information Leaks

**CRITICAL**: Before proceeding with ANY commit, ALWAYS perform a security check to prevent sensitive information from being committed.

**IMPORTANT**: This check only examines **filenames**, not file contents, to protect user privacy and avoid exposing sensitive data to the AI.

#### Get List of Files to be Committed

```bash
git diff --staged --name-only
```

#### Sensitive File Patterns to Detect

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

#### Security Check Process

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

     Commit process ABORTED for your security.
     ```
   - Do NOT proceed with commit
   - Do NOT ask for user confirmation to override
   - Wait for user to fix the issue

4. **If no sensitive filenames detected**:
   - Proceed to Step 4 (Ask User for Confirmation)

#### Important Security Notes

- **Only filenames are checked** - file contents are never read to protect privacy
- **NEVER commit files matching sensitive patterns** - no exceptions
- **ALWAYS check before EVERY commit**
- **ABORT immediately** upon detection
- **PROTECT the user** from accidentally exposing credentials
- This is a **critical security requirement** that cannot be bypassed
- Users should also consider using git hooks (pre-commit, git-secrets, gitleaks) for additional protection

### Step 4: Ask User for Confirmation

Use the `AskUserQuestion` tool to:
1. Present the proposed commit plan (single or multiple commits)
2. Show the suggested commit message(s)
3. Ask if the user wants to proceed or modify

Example question structure:
```
I've analyzed the changes and suggest the following commit(s):

**Commit 1**: feat(neovim): Add LSP configuration for Python
- Changes: home-manager/neovim.nix (added pyright LSP)

**Commit 2**: docs: Update README with macOS setup instructions
- Changes: README.md (added installation steps)

Would you like to proceed with these commits?
```

### Step 5: Create Commits

Based on user confirmation:

1. If splitting commits:
   - Use `git add <specific-files>` to stage files for each commit
   - Create each commit with appropriate message
   - Use `git commit -m "message"` for simple messages
   - Use heredoc for multi-line messages:
   ```bash
   git commit -m "$(cat <<'EOF'
   feat(neovim): Add LSP configuration for Python

   - Add pyright language server
   - Configure Python-specific settings
   - Update plugin dependencies
   EOF
   )"
   ```

2. If single commit:
   - Verify all intended files are staged
   - Create commit with appropriate message

### Step 6: Verify

After creating commits:
1. Run `git log --oneline -5` to show recent commits
2. Run `git status` to verify clean state

## Conventional Commits Reference

When using Conventional Commits format:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks
- `revert`: Reverting previous commits

Format: `<type>(<scope>): <description>`

Example: `feat(home-manager): Add Emacs configuration`

## Important Notes

### Security (HIGHEST PRIORITY)
- **CRITICAL**: ALWAYS perform security check before ANY commit (Step 3.5)
- **NEVER commit sensitive information** (API keys, passwords, tokens, private keys, credentials)
- **IMMEDIATELY ABORT** if sensitive patterns detected - no exceptions, no user override
- **PROTECT the user** from accidentally exposing secrets to version control
- This security check is **NON-NEGOTIABLE** and must be performed every single time

### Commit Process
- NEVER commit without user confirmation when using AskUserQuestion
- Preserve the project's existing commit style if it exists
- Be concise but descriptive in commit messages
- Focus on the "why" and "what", not the "how"
- Do NOT use emojis unless the project history shows consistent emoji usage
- Always verify the commit was created successfully before completing the task

## Example Usage

User: "Create a commit for my changes"

You should:
1. Analyze git status and diff
2. Check commit history for patterns
3. Determine if changes should be split
4. **PERFORM SECURITY CHECK** (check for sensitive files and patterns)
5. If security check passes, use AskUserQuestion to confirm the plan
6. Create the commit(s)
7. Verify success

If security check fails:
- Display security warning
- List affected files with reasons
- Provide remediation steps
- ABORT without creating any commits
