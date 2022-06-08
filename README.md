GitHub Actions
==============

This repository is a home for GitHub Actions intended to be useful across the
Konveyor organization.

Actions exposed in this project include:

* [Reconcile GitHub Issue with Jira](./reconcile-issue/action.yml) - Is
    responsible for a 1-way sync (from GitHub to Jira) of GitHub and Jira
    Issues.

## Contributing

Install dependencies.

```
$ npm install
```

Compile the TypeScript to JavaScript

```
$ ./node_modules/typescript/bin/tsc --build
```

## Reconcile Issue Action

The purpose of this action is to enable developers to focus on GitHub Issues and
allow konveyor projects to be more accessible to the community by allowing
issues entered in GitHub to be populated (and tracked) in Jira. When GitHub
Issues are marked as `triage/accepted`, then it will be visible in Jira as an
issue in the backlog that can be prioritized within the team. This also allows
community contributors to take issues that would otherwise wait for a team
member to work on.

### Usage

This workflow can be found at
[workflows/reconcile_gh_issue.yaml](./workflows/reconcile_gh_issue.yaml). To
use, simply copy the workflow to `${DESIRED_PROJECT_ROOT}/.github/workflows`.
