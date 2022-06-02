import { components } from "@octokit/openapi-types";
import * as github from "@actions/github";

type Label = components["schemas"]["label"];
type Issue = components["schemas"]["issue"];

// our opinionated view of a GitHub Issue.
// https://docs.github.com/en/rest/issues/issues#get-an-issue
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

  getRepoId(): string {
    return `${this.owner}/${this.repo}`;
  }

  getTitle(): string {
    return this.issue.title;
  }

  getBody(): string {
    const body = this.issue.body;
    if (typeof body == "string") {
      return body;
    }
    return "";
  }

  getUrl(): string {
    return this.issue.html_url;
  }

  getLabels(): string[] {
    return this.issue.labels.map((label) => {
      if (typeof label === "string") return label as string;
      return (label as Label).name;
    });
  }

  isClosed(): boolean {
    return this.issue.state == "closed";
  }

  isBug(): boolean {
    return this.getLabels().includes("kind/bug");
  }

  isTriageAccepted(): boolean {
    return this.getLabels().includes("triage/accepted");
  }

  isNeedsTriage(): boolean {
    return this.getLabels().includes("needs-triage");
  }

  async markNeedsTriage() {
    await github.getOctokit(this.token).rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.number,
      labels: ["needs-triage"],
    });
  }

  async addComment(body: string) {
    await github.getOctokit(this.token).rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.number,
      body: body,
    });
  }
}

export { GitHubIssue };
