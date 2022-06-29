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
const jira_1 = require("../jira");
const commentPrefix = "This issue synced with";
async function reconcileIssue() {
    const inputs = {
        token: core.getInput("token"),
        jiraBaseUrl: core.getInput("jiraBaseUrl", { required: true }),
        jiraToken: core.getInput("jiraToken", { required: true }),
        jiraProject: core.getInput("jiraProject", { required: true }),
        requireMissingLabels: core
            .getInput("requireMissingLabels", { required: true })
            .split(",")
            .map((element) => element.trim()),
        additionalLabels: core.getInput("additionalLabels").split(","),
    };
    // First, make sure we are looking at the right thing.
    const context = github.context;
    const payload = context.payload;
    if (!payload.issue) {
        core.warning("Not an issue, skipping");
        return;
    }
    // Then, go get the issue.
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
    const jira = new jira_1.Jira(inputs.jiraBaseUrl, inputs.jiraProject, inputs.jiraToken);
    // Only states allowed for GitHub issues are open/closed
    // https://docs.github.com/en/rest/issues/issues#get-an-issue
    if (ghIssue.isClosed()) {
        let jiraUrl;
        try {
            jiraUrl = await jira.getIssueUrl(ghIssue.key());
            if (jiraUrl == "") {
                core.info("No corresponding Jira found for this closed issue");
                return;
            }
            core.info("Jira issue url found: " + jiraUrl);
        }
        catch (error) {
            core.setFailed(`Something went wrong searching for issue "${ghIssue.key()}" in Jira: ${error}`);
            return;
        }
        try {
            if (!(await jira.issueIsDone(jiraUrl))) {
                await jira.transitionDone(jiraUrl);
            }
        }
        catch (error) {
            core.setFailed(`Something went wrong closing issue ${jiraUrl}: ${error}`);
        }
        const htmlUrl = await jira.getJiraHTMLUrl(jiraUrl);
        await ghIssue.ensureComment(`${commentPrefix}: ${htmlUrl}`);
        return;
    }
    const requiredMissingLabels = inputs.requireMissingLabels.filter((label) => ghIssue.hasLabel(label));
    if (requiredMissingLabels) {
        core.warning(`This issue has ${requiredMissingLabels} that indicate this issue is not triaged.`);
        return;
    }
    // jiraIssueParams are the primary fields we are concerned with updating
    // on the jira issue.
    // We will apply the following labels:
    // + the additional labels specified in the action
    // + the repo id (ie. konveyor/crane) for filtering
    // + the key (ie. konveyor/crane#1234) that links the Issue
    // TODO(djzager): since jira doesn't allow labels with spaces we
    // will likely need to slugify the github labels AND find a way to distinguish
    // github labels from jira labels (maybe a gh: prefix).
    let jiraIssueParams = {
        isBug: ghIssue.isBug(),
        summary: ghIssue.getTitle(),
        description: ghIssue.getBody(),
        labels: inputs.additionalLabels.concat(ghIssue.getRepoId(), ghIssue.key(), ghIssue.getLabelsSlugified()),
        url: ghIssue.getUrl(),
        key: ghIssue.key(),
    };
    let jiraUrl;
    try {
        // If we find a linked jira, update it
        jiraUrl = await jira.getIssueUrl(ghIssue.key());
    }
    catch (error) {
        core.setFailed(`Failed to get Jira issue for key ${ghIssue.key()}: ${error}`);
        return;
    }
    // Update the issue if it already exists
    try {
        if (jiraUrl != "") {
            core.info(`Jira issue url (${jiraUrl}) found, will update`);
            await jira.updateIssue(jiraUrl, jiraIssueParams);
            const htmlUrl = await jira.getJiraHTMLUrl(jiraUrl);
            await ghIssue.ensureComment(`${commentPrefix}: ${htmlUrl}`);
            return;
        }
    }
    catch (error) {
        core.setFailed(`Failed to update Jira Issue with url ${jiraUrl}: ${error}`);
        return;
    }
    // Create the issue if it doesn't
    try {
        jiraUrl = await jira.createIssue(jiraIssueParams);
        const htmlUrl = await jira.getJiraHTMLUrl(jiraUrl);
        await ghIssue.ensureComment(`${commentPrefix}: ${htmlUrl}`);
    }
    catch (error) {
        core.setFailed(`Failed to create Jira Issue: ${error}`);
    }
    return;
}
reconcileIssue();
