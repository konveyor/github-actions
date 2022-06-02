GitHub Actions
==============

This repository is a home for GitHub Actions intended to be useful across the
Konveyor organization.

Actions exposed in this project include:

* [Reconcile GitHub Issue with Jira](./reconcile-issue/action.yml) - Is
    responsible for a 1-way sync (from GitHub to Jira) of GitHub and Jira
    Issues.

## Reconcile Issue Action

### Usage

Example workflow:

```
name: Reconcile GitHub Issue

on:
  issues:
    types:
      - opened
      - closed
      - labeled

jobs:
  reconcile-issue:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Reconcile Issue
        uses: konveyor/github-actions/reconcile-issue@main
        with:
          jiraBaseUrl: https://issues.redhat.com
          jiraToken: ${{ secrets.JIRA_API_TOKEN }}
          jiraProject: MIG
          additionalLabels: community
```

## Contributing

Install dependencies

```
$ npm install
```

Compile the TypeScript to JavaScript

```
$ ./node_modules/typescript/bin/tsc --build
```
