import * as core from "@actions/core";
import * as github from "@actions/github";
import { components } from "@octokit/openapi-types";
import axios from "axios";

type Issue = components["schemas"]["issue"];

async function makeDigest() {
  const inputs = {
    token: core.getInput("token"),
    webhookUrl: core.getInput("slackWebhookUrl"),
    header: core.getInput("messageHeader"),
    hasLabels: core.getInput("hasLabels"),
    missingLabels: core.getInput("missingLabels").split(","),
  };

  // First, make sure we are looking at the right thing.
  const context = github.context;
  const { owner, repo } = context.repo;
  const octokit = github.getOctokit(inputs.token);
  let issues: Issue[];
  try {
    // TODO(djzager): Make state configurable
    ({ data: issues } = await octokit.rest.issues.listForRepo({
      owner: owner,
      repo: repo,
      state: "open",
      labels: inputs.hasLabels,
    }));
  } catch (error) {
    core.setFailed(
      `Failed to get GitHub Issues for ${owner}/${repo}: ${error}`
    );
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
      if (typeof label.name === "undefined") return false;
      return inputs.missingLabels.includes(label.name);
    });
  });

  const headerBlock = {
    type: "header",
    text: {
      type: "plain_text",
      text: inputs.header,
    },
  };
  
  let issueBlocks = issues.map((issue) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `<${issue.html_url}|${issue.number}> ${issue.title}`,
    },
  }));

  if (issueBlocks.length == 0) {
    issueBlocks = [{
      type: "section",
      text: {
        type: "mrkdwn",
        text: `No issues found with labels: ${inputs.hasLabels} without labels: ${inputs.missingLabels}`,
      },
    }]
  }

  const blocks = [headerBlock].concat(issueBlocks);

  // send message
  let response = await axios.post(inputs.webhookUrl, {
    blocks: blocks,
  });
  console.log(response);
}

makeDigest();
