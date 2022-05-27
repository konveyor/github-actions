import * as core from "@actions/core";
import * as github from "@actions/github";
import { components } from "@octokit/openapi-types";
import axios from "axios";

type Label = components["schemas"]["label"];

async function run() {
  const inputs = {
    token: core.getInput("token"),
    jiraBaseUrl: core.getInput("jiraBaseUrl"),
    jiraToken: core.getInput("jiraToken"),
    jiraProject: core.getInput("jiraProject"),
    additionalLabels: core.getInput("additionalLabels").split(","),
  };

  const octokit = github.getOctokit(inputs.token);
  const context = github.context;
  const payload = context.payload;
  if (!payload.issue) {
    core.warning("Not an issue, skipping");
    return;
  }

  // get the GH issue...source of truth
  const i: { owner: string; repo: string; number: number } = context.issue;
  const issueKey = `${i.owner}/${i.repo}#${i.number}`;
  const { data: issue } = await octokit.rest.issues.get({
    owner: i.owner,
    repo: i.repo,
    issue_number: i.number,
  });
  // var labels = (issue.labels as Label[]).map((label) => label.name);
  var labels = issue.labels.map((label) => {
    if (typeof label === "string") return label as string;
    return (label as Label).name;
  });
  core.info(`The labels on issue (${issueKey}) are: ${labels.toString()}`);

  // see if we can find it in Jira
  const jiraIssues = await axios.get(
    inputs.jiraBaseUrl +
      "/rest/api/2/search?jql=" +
      encodeURIComponent(
        `project = ${inputs.jiraProject} AND labels = "${issueKey}"`
      ),
    { headers: { Authorization: `Bearer ${inputs.jiraToken}` } }
  );
  // This tells us how many issues in jira matched our query. We expect only one.
  var numJiraIssues = jiraIssues.data.total;
  if (numJiraIssues > 1) {
    console.dir(jiraIssues.data, { depth: null });
    core.setFailed(
      `Something unexpected happened, expected 0 or 1 issues, found ${numJiraIssues}`
    );
  }
  if (numJiraIssues == 0) {
    core.info(
      "This means, if an issue is to be written, we will need to create it"
    );
  }
  // This is the url to use when interacting with this Jira issue
  const jiraIssue = await axios.get(
    jiraIssues.data.issues[0].self,
    { headers: { Authorization: `Bearer ${inputs.jiraToken}` } }
  );
  console.dir(jiraIssue, { depth: null });

  // await octokit.rest.issues.createComment({
  //   owner: issue.owner,
  //   repo: issue.repo,
  //   issue_number: issue.number,
  //   body: "foo",
  // });
}

run();
