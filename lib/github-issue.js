"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubIssue = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
// our opinionated view of a GitHub Issue.
// https://docs.github.com/en/rest/issues/issues#get-an-issue
class GitHubIssue {
    constructor(token, owner, repo, number, issue) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
        this.number = number;
        this.issue = issue;
    }
    key() {
        return `${this.owner}/${this.repo}#${this.number}`;
    }
    getRepoId() {
        return `${this.owner}/${this.repo}`;
    }
    getTitle() {
        return this.issue.title;
    }
    getBody() {
        const body = this.issue.body;
        if (typeof body == "string") {
            return body;
        }
        return "";
    }
    getUrl() {
        return this.issue.html_url;
    }
    getLabels() {
        return this.issue.labels.map((label) => {
            if (typeof label === "string")
                return label;
            return label.name;
        });
    }
    getLabelsSlugified() {
        return this.issue.labels.map((label) => {
            if (typeof label === "string")
                return label;
            return `gh:${label.name.replace(/\s+/g, '-')}`;
        });
    }
    isClosed() {
        return this.issue.state == "closed";
    }
    isBug() {
        return this.getLabels().includes("kind/bug");
    }
    // ensureComment creates a comment with ${body} if it cannot
    // be found in the issue's comments.
    async ensureComment(body) {
        const octokit = github.getOctokit(this.token);
        // Try  to find the comment
        for await (const { data: comments } of octokit.paginate.iterator(octokit.rest.issues.listComments, {
            owner: this.owner,
            repo: this.repo,
            issue_number: this.number,
        })) {
            const comment = comments.find((comment) => comment.user &&
                comment.user.login == "github-actions[bot]" &&
                comment.body &&
                comment.body.includes(body));
            // If we find the comment...we are done
            if (comment)
                return;
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
    async addComment(body) {
        await github.getOctokit(this.token).rest.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: this.number,
            body: body,
        });
    }
    hasLabel(label) {
        const labels = this.getLabels();
        core.debug(`Looking for label ${label} in ${labels}`);
        return labels.includes(label);
    }
    hasLabelRegexp(regexp) {
        const labels = this.getLabels();
        core.debug(`Looking for label matching regexp ${regexp.toString()} in ${labels}`);
        return labels.find((label) => regexp.test(label)) !== undefined;
    }
    // addLabel adds a label to the issue
    async addLabels(labels) {
        await github.getOctokit(this.token).rest.issues.addLabels({
            owner: this.owner,
            repo: this.repo,
            issue_number: this.number,
            labels: labels,
        });
    }
    // remove a particular label from an issue, but only if it has the label
    async removeLabel(label) {
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
exports.GitHubIssue = GitHubIssue;
