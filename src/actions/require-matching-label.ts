import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHubIssue } from "../github-issue";
import { components } from "@octokit/openapi-types";

type Issue = components["schemas"]["issue"];

async function run() {
  const inputs = {
    token: core.getInput("token"),
    missingComment: core.getInput("missingComment"),
    missingLabel: core.getInput("missingLabel", { required: true }),
    regexp: core.getInput("regexp", { required: true }),
  };

  // First, make sure we are looking at the right thing.
  const context = github.context;
  const payload = context.payload;
  if (!payload.issue && !payload.pull_request) {
    core.setFailed(
      "Not an issue or pull request. This action should only be called on issues or pull requests."
    );
  }

  // Then, go get the issue. Should be the same for pr
  const octokit = github.getOctokit(inputs.token);
  const { owner, repo, number } = context.issue;
  let issue: Issue;
  try {
    ({ data: issue } = await octokit.rest.issues.get({
      owner: owner,
      repo: repo,
      issue_number: number,
    }));
  } catch (error) {
    core.setFailed(
      `Failed to get GitHub Issue ${owner}/${repo}#${number}: ${error}`
    );
    return;
  }

  // Instantiate our opinionated represenation of {gh|jira} issues
  const ghIssue = new GitHubIssue(inputs.token, owner, repo, number, issue);

  // Only states allowed for GitHub issues are open/closed
  // https://docs.github.com/en/rest/issues/issues#get-an-issue
  if (ghIssue.isClosed()) {
    core.info("Do nothing for closed issues.");
    return;
  }

  const regexp = new RegExp(inputs.regexp);
  if (ghIssue.hasLabelRegexp(regexp)) {
    core.info("Issue has label matching expression. Do nothing.");
    await ghIssue.removeLabel(inputs.missingLabel);
    return;
  }

  core.info(`Adding label ${inputs.missingLabel}.`);
  await ghIssue.addLabels([inputs.missingLabel]);

  if (inputs.missingComment) {
    core.info(`Adding comment if not already present.`);
    await ghIssue.ensureComment(inputs.missingComment);
  }
}

run();
