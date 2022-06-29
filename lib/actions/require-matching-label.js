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
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const github_issue_1 = require("../github-issue");
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
        core.setFailed("Not an issue or pull request. This action should only be called on issues or pull requests.");
    }
    // Then, go get the issue. Should be the same for pr
    const octokit = github.getOctokit(inputs.token);
    const { owner, repo, number } = context.issue;
    let issue;
    try {
        ({ data: issue } = await octokit.rest.issues.get({
            owner: owner,
            repo: repo,
            issue_number: number,
        }));
    }
    catch (error) {
        core.setFailed(`Failed to get GitHub Issue ${owner}/${repo}#${number}: ${error}`);
        return;
    }
    // Instantiate our opinionated represenation of {gh|jira} issues
    const ghIssue = new github_issue_1.GitHubIssue(inputs.token, owner, repo, number, issue);
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
