---
name: merge-to-main
description: Merge the current branch's PR to main, pull latest, and monitor CI/CD
disable-model-invocation: true
allowed-tools: Bash
---

Merge the current branch's PR into main and verify the deployment pipeline.

## Step 1: Identify the PR

Find the PR for the current branch:

```bash
gh pr view --json number,title,state,mergeable,statusCheckRollup
```

If no PR exists or checks are failing, stop and report.

## Step 2: Merge the PR

Merge using squash (default project convention):

```bash
gh pr merge --squash
```

If merge fails, report the error and stop.

## Step 3: Switch to main and pull

```bash
git checkout main && git pull origin main
```

## Step 4: Monitor CI/CD

Watch for the staging deploy (triggered automatically on push to main):

```bash
gh run list --branch main --limit 3
```

Then watch the runs until they complete. Report whether CI and staging deploy succeeded or failed.

## Step 5: Clean up

Delete the local feature branch that was just merged:

```bash
git branch -d <branch-name>
```

Report the final status to the user.
