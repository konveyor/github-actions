import * as core from "@actions/core";
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

  getLabelsSlugified(): string[] {
    return this.issue.labels.map((label) => {
      if (typeof label === "string") return label as string;
      return `gh:${(label as Label).name.replace(/\s+/g, '-')}`;
    });
  }

  isClosed(): boolean {
    return this.issue.state == "closed";
  }

  isBug(): boolean {
    return this.getLabels().includes("kind/bug");
  }

  // ensureComment creates a comment with ${body} if it cannot
  // be found in the issue's comments.
  async ensureComment(body: string) {
    const octokit = github.getOctokit(this.token);

    // Try  to find the comment
    for await (const { data: comments } of octokit.paginate.iterator(
      octokit.rest.issues.listComments,
      {
        owner: this.owner,
        repo: this.repo,
        issue_number: this.number,
      }
    )) {
      const comment = comments.find(
        (comment) =>
          comment.user &&
          comment.user.login == "github-actions[bot]" &&
          comment.body &&
          comment.body.includes(body)
      );

      // If we find the comment...we are done
      if (comment) return;
    }

    // Create the comment if it doesn't exist
    await github.getOctokit(this.token).rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.number,
      body: body,
    });
  }


  // addComment creates a comment with ${body}
  async addComment(body: string) {
    await github.getOctokit(this.token).rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.number,
      body: body,
    });
  }

  hasLabel(label: string): boolean {
    const labels = this.getLabels();
    core.debug(`Looking for label ${label} in ${labels}`);
    return labels.includes(label);
  }

  hasLabelRegexp(regexp: RegExp): boolean {
    const labels = this.getLabels();
    core.debug(`Looking for label matching regexp ${regexp.toString()} in ${labels}`);
    return labels.find((label) => regexp.test(label)) !== undefined;
  }

  // addLabel adds a label to the issue
  async addLabels(labels: string[]) {
    await github.getOctokit(this.token).rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: this.number,
      labels: labels,
    });
  }

  // remove a particular label from an issue, but only if it has the label
  async removeLabel(label: string) {
    if (this.hasLabel(label)) {
      await github.getOctokit(this.token).rest.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: this.number,
        name: label,
      });
    }
  }

}

export { GitHubIssue };
