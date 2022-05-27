import * as core from "@actions/core";
import * as github from "@actions/github";

async function run() {
  const inputs = {
    token: core.getInput("token"),
    jiraBaseUrl: core.getInput("jiraBaseUrl"),
    jiraToken: core.getInput("jiraToken"),
    project: core.getInput("project"),
    additionalLabels: core.getInput("additionalLabels").split(","),
  };

  const octokit = github.getOctokit(inputs.token);
  const context = github.context;
  const payload = context.payload;
  if (!payload.issue) {
    core.warning('Not an issue, skipping');
    return;
  }

  // get the issue
  const i: {owner: string; repo: string; number: number} = context.issue;
  const { data: issue } = await octokit.rest.issues.get({
    owner: i.owner,
    repo: i.repo,
    issue_number: i.number,
  });

  core.info(`The labels on this issue are: ${issue.labels}`)
  // await octokit.rest.issues.createComment({
  //   owner: issue.owner,
  //   repo: issue.repo,
  //   issue_number: issue.number,
  //   body: "foo",
  // });
}

run();
