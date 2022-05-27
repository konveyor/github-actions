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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const axios_1 = __importDefault(require("axios"));
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
    const i = context.issue;
    const issueKey = `${i.owner}/${i.repo}#${i.number}`;
    const { data: issue } = await octokit.rest.issues.get({
        owner: i.owner,
        repo: i.repo,
        issue_number: i.number,
    });
    // var labels = (issue.labels as Label[]).map((label) => label.name);
    var labels = issue.labels.map((label) => {
        if (typeof label === "string")
            return label;
        return label.name;
    });
    core.info(`The labels on issue (${issueKey}) are: ${labels.toString()}`);
    // see if we can find it in Jira
    const jiraIssues = await axios_1.default.get(inputs.jiraBaseUrl +
        "/rest/api/2/search?jql=" +
        encodeURIComponent(`project = ${inputs.jiraProject} AND labels = "${issueKey}"`), { headers: { Authorization: `Bearer ${inputs.jiraToken}` } });
    // This tells us how many issues in jira matched our query. We expect only one.
    var numJiraIssues = jiraIssues.data.total;
    if (numJiraIssues > 1) {
        console.dir(jiraIssues.data, { depth: null });
        core.setFailed(`Something unexpected happened, expected 0 or 1 issues, found ${numJiraIssues}`);
    }
    if (numJiraIssues == 0) {
        core.info("This means, if an issue is to be written, we will need to create it");
    }
    // This is the url to use when interacting with this Jira issue
    const jiraIssue = await axios_1.default.get(jiraIssues.data.issues[0].self, { headers: { Authorization: `Bearer ${inputs.jiraToken}` } });
    console.dir(jiraIssue, { depth: null });
    // await octokit.rest.issues.createComment({
    //   owner: issue.owner,
    //   repo: issue.repo,
    //   issue_number: issue.number,
    //   body: "foo",
    // });
}
run();
