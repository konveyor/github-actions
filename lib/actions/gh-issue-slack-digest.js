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
async function makeDigest() {
    const inputs = {
        token: core.getInput("token"),
        webhookUrl: core.getInput("slackWebhookUrl"),
        header: core.getInput("messageHeader"),
        hasLabels: core.getInput("hasLabels"),
        missingLabels: core
            .getInput("missingLabels")
            .split(",")
            .map((element) => element.trim()),
        // TODO(djzager): figure out multiple mentions (users + groups)
        // https://api.slack.com/reference/surfaces/formatting#mentioning-users
        mentionUsers: core
            .getInput("mentionUsers")
            .split(",")
            .map((element) => element.trim()),
    };
    // First, make sure we are looking at the right thing.
    const context = github.context;
    const { owner, repo } = context.repo;
    const octokit = github.getOctokit(inputs.token);
    let issues;
    try {
        // TODO(djzager): Make state configurable
        ({ data: issues } = await octokit.rest.issues.listForRepo({
            owner: owner,
            repo: repo,
            state: "open",
            labels: inputs.hasLabels,
        }));
    }
    catch (error) {
        core.setFailed(`Failed to get GitHub Issues for ${owner}/${repo}: ${error}`);
        return;
    }
    core.info(`Found ${issues.length} issues`);
    // filter issues out of our list that have any of our missingLabels
    issues = issues.filter((issue) => {
        // if any label is in our missingLabels list...drop it
        return !issue.labels.some((label) => {
            if (typeof label === "string") {
                return inputs.missingLabels.includes(label);
            }
            if (typeof label.name === "undefined")
                return false;
            return inputs.missingLabels.includes(label.name);
        });
    });
    let issueBlocks = issues.map((issue) => ({
        type: "section",
        text: {
            type: "mrkdwn",
            text: `<${issue.html_url}|${issue.number}> ${issue.title}`,
        },
    }));
    if (issueBlocks.length == 0) {
        issueBlocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `No issues found with labels: ${inputs.hasLabels}\nwithout labels: ${inputs.missingLabels}`,
                },
            },
        ];
    }
    const blocks = [
        {
            type: "header",
            text: {
                type: "plain_text",
                text: inputs.header,
            },
        },
        ...issueBlocks,
        inputs.mentionUsers && {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `cc ${inputs.mentionUsers.join(" ")}`,
            },
        },
    ];
    // send message
    let response = await axios_1.default.post(inputs.webhookUrl, {
        blocks: blocks,
    });
    console.log(response);
}
makeDigest();
