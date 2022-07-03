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
const watchers_1 = require("./watchers");
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
        const jqlQuery = encodeURIComponent(`project = ${this.project} AND labels = "${key}"`);
        const { data: { total: numIssues, issues: jiraIssues }, } = await axios_1.default.get(`${this.baseUrl}/rest/api/2/search?jql=${jqlQuery}`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        // This tells us how many issues in jira matched our query. We expect only one or zero.
        if (numIssues > 1) {
            console.dir(jiraIssues, { depth: null });
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
        const { data: { key: jiraKey }, } = await axios_1.default.get(url, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        return `${this.baseUrl}/browse/${jiraKey}`;
    }
    // getJiraIssueType retrieves the issueType from the specified jira
    // issue and returns it as a string
    async getJiraIssueType(url) {
        const { data: { fields: { issuetype: { name: issueType }, }, }, } = await axios_1.default.get(`${url}?fields=issuetype`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has issuetype: ${issueType}`);
        return issueType;
    }
    async getJiraIssueSummary(url) {
        const { data: { fields: { summary: summary }, }, } = await axios_1.default.get(`${url}?fields=summary`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has summary: ${summary}`);
        return summary;
    }
    async getJiraIssueDescription(url) {
        const { data: { fields: { description: description }, }, } = await axios_1.default.get(`${url}?fields=description`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has description: ${description}`);
        return description;
    }
    async getJiraIssueLabels(url) {
        const { data: { fields: { labels: jiraLabels }, }, } = await axios_1.default.get(`${url}?fields=labels`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        core.info(`Jira issue at url (${url}) has labels: ${jiraLabels}`);
        return jiraLabels;
    }
    async getJiraRemoteLinks(url) {
        const { data: remoteLinksData } = await axios_1.default.get(`${url}/remotelink`, {
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
        const found = remoteLinks.find((link) => link.title == key);
        core.info(`Remote link found: ${found}`);
        return found !== undefined;
    }
    // getJiraIssueStatus returns the current status as a string
    async getJiraIssueStatus(url) {
        const { data: { fields: { status: { name: jiraStatus }, }, }, } = await axios_1.default.get(`${url}?fields=status`, {
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
        let response = await axios_1.default.post(`${url}/transitions`, {
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
    async transitionBacklog(url) {
        let response = await axios_1.default.post(`${url}/transitions`, {
            update: {
                comment: [
                    {
                        add: {
                            body: `Associated GitHub Issue is open.`,
                        },
                    },
                ],
            },
            transition: { id: JiraTransitions.Backlog },
        }, { headers: { Authorization: `Bearer ${this.token}` } });
        console.log(response);
    }
    async addRemoteLink(jiraUrl, url, key) {
        await axios_1.default.post(`${jiraUrl}/remotelink`, {
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
        core.info("jira::createIssue");
        const issueType = isBug ? "Bug" : "Story";
        const { data: { self: jiraUrl }, } = await axios_1.default.post(`${this.baseUrl}/rest/api/2/issue`, {
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
        core.info("jira::updateIssue");
        core.info("priorityMapping:");
        core.info(`url: ${url}`);
        core.info(`key: ${key}`);
        core.info(`jiraUrl: ${jiraUrl}`);
        // const issueType = isBug ? "Bug" : "Story";
        // const issueTypeId = JiraIssueTypes[issueType];
        // const currentType = await this.getJiraIssueType(url);
        const currentSummary = await this.getJiraIssueSummary(jiraUrl);
        const currentDescription = await this.getJiraIssueDescription(jiraUrl);
        const currentLabels = await this.getJiraIssueLabels(jiraUrl);
        // const currentWatchers = await this.getJiraIssueWatchers(key);
        // core.info(currentWatchers);
        const addLabels = labels
            .filter((label) => !currentLabels.includes(label))
            .map((str) => ({ add: str }));
        const rmLabels = currentLabels
            .filter((label) => !labels.includes(label) && label.startsWith('gh:'))
            .map((str) => ({ remove: str }));
        const isDone = await this.issueIsDone(jiraUrl);
        // check for remote link first
        if (!(await this.isRemoteLinkPresent(jiraUrl, key))) {
            await this.addRemoteLink(jiraUrl, url, key);
        }
        // Ensure watchers from watch group are subscribed for updated
        const jwm = new watchers_1.JiraWatcherManager(jiraUrl, this.token);
        try {
            await jwm.ensureDesiredWatchers();
        }
        catch (err) {
            core.error(`${err}`);
        }
        // don't bother updating if all the relevant fields are the same.
        if (currentSummary == summary &&
            currentDescription == description &&
            !addLabels.length &&
            !isDone) {
            core.info("No changes needed");
            return false;
        }
        core.info("Updating Jira");
        await axios_1.default.put(jiraUrl, {
            update: {
                summary: [{ set: summary }],
                description: [{ set: description }],
                labels: addLabels.concat(rmLabels),
            },
            // fields: {
            //   issueType: { id: issueTypeId },
            // },
        }, { headers: { Authorization: `Bearer ${this.token}` } });
        if (isDone) {
            await this.transitionBacklog(jiraUrl);
        }
        return true;
    }
}
exports.Jira = Jira;
