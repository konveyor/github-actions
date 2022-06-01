import * as core from "@actions/core";
import * as github from "@actions/github";
import { components } from "@octokit/openapi-types";
import axios from "axios";

// TODO(djzager)
type Issue = components["schemas"]["issue"];

// TODO(djzager): don't know if these are universal
// JiraTransitions - hold the id for the transitions we are concerned about.
// these can be found on:
// https://issues.redhat.com/rest/api/2/issue/{issueKey}/transitions
enum JiraTransitions {
  Backlog = "11",
  SelectedForDevelopment = "21",
  InProgress = "31",
  Done = "41",
  QE = "51",
}

class Jira {
  baseUrl: string;
  project: string;
  token: string;

  constructor(baseUrl: string, project: string, token: string) {
    this.baseUrl = baseUrl;
    this.project = project;
    this.token = token;
  }

  // getIssueUrl takes the key (ie. konveyor/crane#1234) and returns the url
  // https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-search/#api-rest-api-2-jql-match-post
  async getIssueUrl(key: string): Promise<string> {
    try {
      let jiraIssues = await axios.get(
        this.baseUrl +
          "/rest/api/2/search?jql=" +
          encodeURIComponent(`project = ${this.project} AND labels = "${key}"`),
        { headers: { Authorization: `Bearer ${this.token}` } }
      );

      // This tells us how many issues in jira matched our query. We expect only one or zero.
      var numJiraIssues = jiraIssues.data.total;
      if (numJiraIssues > 1) {
        console.dir(jiraIssues.data, { depth: null });
        core.setFailed(
          `Something unexpected happened, expected 0 or 1 issues, found ${numJiraIssues}`
        );
      }
      if (numJiraIssues == 0) {
        core.info(
          `No issues found in Jira with project (${this.project}) and label (${key}).`
        );
        return "";
      }
      return jiraIssues.data.issues[0].self;
    } catch (error) {
      core.setFailed(
        `Something went wrong searching for issue "${key}" in Jira: ${error}`
      );
      return "";
    }
  }

  // getJiraIssueStatus returns the current status as a string
  async getJiraIssueStatus(url: string): Promise<string> {
    let statusUrl = url + "?fields=status";
    let jiraStatus;
    // Get issues in the project with our ghIssueKey label. There should only ever be one.
    try {
      ({
        data: {
          fields: {
            status: { name: jiraStatus },
          },
        },
      } = await axios.get(statusUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
      }));
      core.info(`Jira issue at url (${url}) has status: ${jiraStatus}`);
    } catch (error) {
      core.setFailed(`Something went wrong getting ${statusUrl}: ${error}`);
    }

    return jiraStatus;
  }

  async issueIsDone(url: string): Promise<boolean> {
    return (await this.getJiraIssueStatus(url)) == "Done";
  }

  async transitionDone(url: string) {
    try {
      // TODO(djzager): Need to move this to QE when appropriate rather than just Done.
      // Perhaps we can inspect the labels?
      let response = await axios.post(
        url,
        {
          update: {
            comment: [
              {
                add: {
                  body: `Associated GitHub Issue has been closed.`,
                },
              },
            ],
          },
          transition: { id: JiraTransitions.Done },
        },
        { headers: { Authorization: `Bearer ${this.token}` } }
      );
      console.log(response);
    } catch (error) {
      core.setFailed(`Something went wrong closing issue ${url}: ${error}`);
    }
  }
}

// our opinionated view of a GitHub Issue.
class GitHubIssue {
  token: string;
  owner: string;
  repo: string;
  number: number;
  issue: Issue;

  constructor(
    token: string,
    owner: string,
    repo: string,
    number: number,
    issue: Issue
  ) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.number = number;
    this.issue = issue;
  }

  key(): string {
    return `${this.owner}/${this.repo}#${this.number}`;
  }

  async labels(): Promise<string[]> {
    return this.issue.labels.map((label) => {
      if (typeof label === "string") return label as string;
      return (label as components["schemas"]["label"]).name;
    });
  }

  isClosed(): boolean {
    return this.issue.state == "closed";
  }
}

async function reconcileIssue() {
  const inputs = {
    token: core.getInput("token"),
    jiraBaseUrl: core.getInput("jiraBaseUrl"),
    jiraToken: core.getInput("jiraToken"),
    jiraProject: core.getInput("jiraProject"),
    additionalLabels: core.getInput("additionalLabels").split(","),
  };

  // First, make sure we are looking at the right thing.
  const context = github.context;
  const payload = context.payload;
  if (!payload.issue) {
    core.warning("Not an issue, skipping");
    return;
  }

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
  const jira = new Jira(
    inputs.jiraBaseUrl,
    inputs.jiraProject,
    inputs.jiraToken
  );

  // Only states allowed for GitHub issues are open/closed
  // https://docs.github.com/en/rest/issues/issues#get-an-issue
  if (ghIssue.isClosed()) {
    let jiraUrl = await jira.getIssueUrl(ghIssue.key());
    if (jiraUrl == "") {
      core.info("No corresponding Jira found for this closed issue.");
      return;
    }
    core.info("Jira issue url found: " + jiraUrl);

    if (!jira.issueIsDone(jiraUrl)) {
      jira.transitionDone(jiraUrl);
    }
    core.info("Reconcile complete");
    return;
  }

  // if (!labels.includes("triage/accepted")) {
  // }

  // This is the url to use when interacting with this Jira issue
  // const jiraIssue = await axios.get(jiraIssues.data.issues[0].self, {
  //   headers: { Authorization: `Bearer ${inputs.jiraToken}` },
  // });
  // console.dir(jiraIssue, { depth: null });

  // await octokit.rest.issues.createComment({
  //   owner: issue.owner,
  //   repo: issue.repo,
  //   issue_number: issue.number,
  //   body: "foo",
  // });
}

reconcileIssue();
