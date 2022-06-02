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
exports.Jira = void 0;
const core = __importStar(require("@actions/core"));
const axios_1 = __importDefault(require("axios"));
// More info about the jira api here.
// https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issues/#api-group-issues
// TODO(djzager): don't know if these are universal
// JiraTransitions - hold the id for the transitions we are concerned about.
// these can be found on:
// https://issues.redhat.com/rest/api/2/issue/{issueKey}/transitions
var JiraTransitions;
(function (JiraTransitions) {
    JiraTransitions["Backlog"] = "11";
    JiraTransitions["SelectedForDevelopment"] = "21";
    JiraTransitions["InProgress"] = "31";
    JiraTransitions["Done"] = "41";
    JiraTransitions["QE"] = "51";
})(JiraTransitions || (JiraTransitions = {}));
class Jira {
    constructor(baseUrl, project, token) {
        this.baseUrl = baseUrl;
        this.project = project;
        this.token = token;
    }
    // getIssueUrl takes the key (ie. konveyor/crane#1234) and returns the url
    // https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-search/#api-rest-api-2-jql-match-post
    async getIssueUrl(key) {
        const { data: { total: numIssues, issues: jiraIssues }, } = await axios_1.default.get(this.baseUrl +
            "/rest/api/2/search?jql=" +
            encodeURIComponent(`project = ${this.project} AND labels = "${key}"`), { headers: { Authorization: `Bearer ${this.token}` } });
        // This tells us how many issues in jira matched our query. We expect only one or zero.
        if (numIssues > 1) {
            console.dir(jiraIssues.data, { depth: null });
            throw `Expected to find 0 or 1 issues with key: ${key}, found ${numIssues}`;
        }
        if (numIssues == 0) {
            core.info(`No issues found in Jira with project (${this.project}) and label (${key}).`);
            return "";
        }
        return jiraIssues[0].self;
    }
    // getJiraHTMLUrl returns a non-rest URL for the specified jira issue
    async getJiraHTMLUrl(url) {
        const { data: { key: jiraKey, }, } = await axios_1.default.get(url, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        return `${this.baseUrl}/browse/${jiraKey}`;
    }
    // getJiraIssueType retrieves the issueType from the specified jira
    // issue and returns it as a string
    async getJiraIssueType(url) {
        const labelsUrl = url + "?fields=issuetype";
        const { data: { fields: { issuetype: { name: issueType }, }, }, } = await axios_1.default.get(labelsUrl, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has issuetype: ${issueType}`);
        return issueType;
    }
    async getJiraIssueSummary(url) {
        const labelsUrl = url + "?fields=summary";
        const { data: { fields: { summary: summary }, }, } = await axios_1.default.get(labelsUrl, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has summary: ${summary}`);
        return summary;
    }
    async getJiraIssueDescription(url) {
        const labelsUrl = url + "?fields=description";
        const { data: { fields: { description: description }, }, } = await axios_1.default.get(labelsUrl, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has description: ${description}`);
        return description;
    }
    async getJiraIssueLabels(url) {
        const labelsUrl = url + "?fields=labels";
        const { data: { fields: { labels: jiraLabels }, }, } = await axios_1.default.get(labelsUrl, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has labels: ${jiraLabels}`);
        return jiraLabels;
    }
    async getJiraRemoteLinks(url) {
        const remoteLinkUrl = url + "/remotelink";
        const { data: remoteLinksData } = await axios_1.default
            .get(remoteLinkUrl, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        const remoteLinks = remoteLinksData.map((remoteLink) => ({
            url: remoteLink.object.url,
            title: remoteLink.object.title,
            icon: remoteLink.object.icon,
        }));
        return remoteLinks;
    }
    async isRemoteLinkPresent(url, key) {
        const remoteLinks = await this.getJiraRemoteLinks(url);
        return (remoteLinks.find((link) => {
            link.title == key;
        }) !== undefined);
    }
    // getJiraIssueStatus returns the current status as a string
    async getJiraIssueStatus(url) {
        const statusUrl = url + "?fields=status";
        const { data: { fields: { status: { name: jiraStatus }, }, }, } = await axios_1.default.get(statusUrl, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has status: ${jiraStatus}`);
        return jiraStatus;
    }
    async issueIsDone(url) {
        return (await this.getJiraIssueStatus(url)) == "Done";
    }
    async transitionDone(url) {
        // TODO(djzager): Need to move this to QE when appropriate rather than just Done.
        // Perhaps we can inspect the labels?
        let response = await axios_1.default.post(url, {
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
        }, { headers: { Authorization: `Bearer ${this.token}` } });
        console.log(response);
    }
    async addRemoteLink(jiraUrl, url, key) {
        await axios_1.default.post(jiraUrl, {
            object: {
                url: url,
                title: key,
                icon: {
                    url16x16: "https://github.com/favicon.ico",
                },
            },
        }, { headers: { Authorization: `Bearer ${this.token}` } });
    }
    async createIssue({ isBug, summary, description, labels, url, key, }) {
        const issueType = isBug ? "Bug" : "Story";
        const { data: { self: jiraUrl }, } = await axios_1.default.post(this.baseUrl, {
            fields: {
                summary: summary,
                description: description,
                project: {
                    key: this.project,
                },
                issuetype: {
                    name: issueType,
                },
                labels: labels,
            },
        }, { headers: { Authorization: `Bearer ${this.token}` } });
        // Add remote link
        await this.addRemoteLink(jiraUrl, url, key);
        return jiraUrl;
    }
    async updateIssue(jiraUrl, { summary, description, labels, url, key }) {
        // const issueType = isBug ? "Bug" : "Story";
        // const issueTypeId = JiraIssueTypes[issueType];
        // const currentType = await this.getJiraIssueType(url);
        const currentSummary = await this.getJiraIssueSummary(jiraUrl);
        const currentDescription = await this.getJiraIssueDescription(jiraUrl);
        const currentLabels = await this.getJiraIssueLabels(jiraUrl);
        const addLabels = labels
            .filter((label) => !currentLabels.includes(label))
            .map((str) => ({ add: str }));
        // don't bother updating if all the relevant fields are the same.
        if (currentSummary == summary && currentDescription == description) {
            return;
        }
        await axios_1.default.put(jiraUrl, {
            update: {
                summary: [{ set: summary }],
                description: [{ set: description }],
                labels: addLabels,
            },
            // fields: {
            //   issueType: { id: issueTypeId },
            // },
        }, { headers: { Authorization: `Bearer ${this.token}` } });
        if (!(await this.isRemoteLinkPresent(jiraUrl, key))) {
            core.info(`Remote link for ${key} not found`);
            // Add remote link
            await this.addRemoteLink(jiraUrl, url, key);
            return;
        }
        core.info(`Remote link for ${key} found`);
    }
}
exports.Jira = Jira;
