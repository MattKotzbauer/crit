---
description: Merge changes from a child session into the current branch (project)
allowed_tools: ["Bash", "Read", "Edit", "Glob", "Grep"]
---

# Merge Child Session Changes

I'll help you merge changes from child session `$1` into your current branch.

## Step 1: Check Child Worktree for Uncommitted Work

Let's navigate to the child worktree and check for any uncommitted or untracked files:

```bash
cd /home/matt/.orchestra/subagents/orchestra-$1 && git status
```

This will show:
- Modified files (changes not staged)
- Staged files (changes ready to commit)
- Untracked files (new files not yet added)

If there are any uncommitted changes or untracked files, I'll need to commit them from within the worktree:
1. Review what was changed
2. Stage files: `cd /home/matt/.orchestra/subagents/orchestra-$1 && git add <files>`
3. Commit with message: `cd /home/matt/.orchestra/subagents/orchestra-$1 && git commit -m "message"`

Let me check the worktree now...

## Step 3: Merge the Child Branch

Once all changes are committed in the child branch, I'll merge it into your current branch:

```bash
git merge $1
```

## Step 4: Verify and Clean Up

After merging:
1. Run any tests to ensure nothing broke
2. Confirm the merge looks correct
3. Optionally delete the child branch if no longer needed: `git branch -d $1`

Let me start by reviewing the changes...
