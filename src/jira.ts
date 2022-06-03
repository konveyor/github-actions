import * as core from "@actions/core";
import axios from "axios";

// More info about the jira api here.
// https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issues/#api-group-issues

// TODO(djzager): don't know if these are universal
// JiraTransitions - hold the id for the transitions we are concerned about.
// these can be found on:
// https://issues.redhat.com/rest/api/2/issue/{issueKey}/transitions
enum JiraTransitions {
  Backlog = "11",
  SelectedForDevelopment = "21",
  InProgress = "31",
  Done = "41",
  QE = "51",
}

// TODO(djzager): don't know if these are universal
// enum JiraIssueTypes {
//   Bug = "1",
//   Story = "17",
// }

interface JiraIssueParams {
  isBug: boolean;
  summary: string;
  description: string;
  labels: string[];
  url: string;
  key: string;
}

type JiraRemoteLink = {
  url: string;
  title: string;
  icon: {
    url16x16: string;
  };
};

class Jira {
  baseUrl: string;
  project: string;
  token: string;

  constructor(baseUrl: string, project: string, token: string) {
    this.baseUrl = baseUrl;
    this.project = project;
    this.token = token;
  }

  // getIssueUrl takes the key (ie. konveyor/crane#1234) and returns the url
  // https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-search/#api-rest-api-2-jql-match-post
  async getIssueUrl(key: string): Promise<string> {
    const jqlQuery = encodeURIComponent(
      `project = ${this.project} AND labels = "${key}"`
    );
    const {
      data: { total: numIssues, issues: jiraIssues },
    } = await axios.get(`${this.baseUrl}/rest/api/2/search?jql=${jqlQuery}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    // This tells us how many issues in jira matched our query. We expect only one or zero.
    if (numIssues > 1) {
      console.dir(jiraIssues, { depth: null });
      throw `Expected to find 0 or 1 issues with key: ${key}, found ${numIssues}`;
    }
    if (numIssues == 0) {
      core.info(
        `No issues found in Jira with project (${this.project}) and label (${key}).`
      );
      return "";
    }
    return jiraIssues[0].self;
  }

  // getJiraHTMLUrl returns a non-rest URL for the specified jira issue
  async getJiraHTMLUrl(url: string): Promise<string> {
    const {
      data: { key: jiraKey },
    } = await axios.get(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    return `${this.baseUrl}/browse/${jiraKey}`;
  }

  // getJiraIssueType retrieves the issueType from the specified jira
  // issue and returns it as a string
  async getJiraIssueType(url: string): Promise<string> {
    const {
      data: {
        fields: {
          issuetype: { name: issueType },
        },
      },
    } = await axios.get(`${url}?fields=issuetype`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    core.info(`Jira issue at url (${url}) has issuetype: ${issueType}`);

    return issueType;
  }

  async getJiraIssueSummary(url: string): Promise<string> {
    const {
      data: {
        fields: { summary: summary },
      },
    } = await axios.get(`${url}?fields=summary`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    core.info(`Jira issue at url (${url}) has summary: ${summary}`);

    return summary;
  }

  async getJiraIssueDescription(url: string): Promise<string> {
    const {
      data: {
        fields: { description: description },
      },
    } = await axios.get(`${url}?fields=description`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    core.info(`Jira issue at url (${url}) has description: ${description}`);

    return description;
  }

  async getJiraIssueLabels(url: string): Promise<string[]> {
    const {
      data: {
        fields: { labels: jiraLabels },
      },
    } = await axios.get(`${url}?fields=labels`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    core.info(`Jira issue at url (${url}) has labels: ${jiraLabels}`);

    return jiraLabels;
  }

  async getJiraRemoteLinks(url: string): Promise<JiraRemoteLink[]> {
    const { data: remoteLinksData } = await axios.get(`${url}/remotelink`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    const remoteLinks = remoteLinksData.map((remoteLink) => ({
      url: remoteLink.object.url,
      title: remoteLink.object.title,
      icon: remoteLink.object.icon,
    }));

    console.log(remoteLinks);
    return remoteLinks;
  }

  async isRemoteLinkPresent(url: string, key: string): Promise<boolean> {
    const remoteLinks = await this.getJiraRemoteLinks(url);
    return (
      remoteLinks.find((link) => {
        link.title == key;
      }) !== undefined
    );
  }

  // getJiraIssueStatus returns the current status as a string
  async getJiraIssueStatus(url: string): Promise<string> {
    const {
      data: {
        fields: {
          status: { name: jiraStatus },
        },
      },
    } = await axios.get(`${url}?fields=status`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    core.info(`Jira issue at url (${url}) has status: ${jiraStatus}`);

    return jiraStatus;
  }

  async issueIsDone(url: string): Promise<boolean> {
    return (await this.getJiraIssueStatus(url)) == "Done";
  }

  async transitionDone(url: string) {
    // TODO(djzager): Need to move this to QE when appropriate rather than just Done.
    // Perhaps we can inspect the labels?
    let response = await axios.post(
      `${url}/transitions`,
      {
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
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    console.log(response);
  }

  async transitionBacklog(url: string) {
    let response = await axios.post(
      `${url}/transitions`,
      {
        update: {
          comment: [
            {
              add: {
                body: `Associated GitHub Issue is open.`,
              },
            },
          ],
        },
        transition: { id: JiraTransitions.Backlog},
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    console.log(response);
  }

  async addRemoteLink(jiraUrl: string, url: string, key: string) {
    await axios.post(
      `${jiraUrl}/remotelink`,
      {
        object: {
          url: url,
          title: key,
          icon: {
            url16x16: "https://github.com/favicon.ico",
          },
        },
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
  }

  async createIssue({
    isBug,
    summary,
    description,
    labels,
    url,
    key,
  }: JiraIssueParams): Promise<string> {
    const issueType = isBug ? "Bug" : "Story";
    const {
      data: { self: jiraUrl },
    } = await axios.post(
      this.baseUrl,
      {
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
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );

    // Add remote link
    await this.addRemoteLink(jiraUrl, url, key);

    return jiraUrl;
  }

  async updateIssue(
    jiraUrl: string,
    { summary, description, labels, url, key }: JiraIssueParams
  ): Promise<boolean> {
    // const issueType = isBug ? "Bug" : "Story";
    // const issueTypeId = JiraIssueTypes[issueType];
    // const currentType = await this.getJiraIssueType(url);
    const currentSummary = await this.getJiraIssueSummary(jiraUrl);
    const currentDescription = await this.getJiraIssueDescription(jiraUrl);
    const currentLabels = await this.getJiraIssueLabels(jiraUrl);
    const addLabels = labels
      .filter((label) => !currentLabels.includes(label))
      .map((str) => ({ add: str }));

    // check for remote link first
    if (!(await this.isRemoteLinkPresent(jiraUrl, key))) {
      await this.addRemoteLink(jiraUrl, url, key);
    }

    // don't bother updating if all the relevant fields are the same.
    if (currentSummary == summary && currentDescription == description && !(await this.issueIsDone(jiraUrl))) {
      core.info("No changes needed");
      return false;
    }
    core.info("Updating Jira");

    await axios.put(
      jiraUrl,
      {
        update: {
          summary: [{ set: summary }],
          description: [{ set: description }],
          labels: addLabels,
        },
        // fields: {
        //   issueType: { id: issueTypeId },
        // },
      },
      { headers: { Authorization: `Bearer ${this.token}` } }
    );

    if (await this.issueIsDone(jiraUrl)) {
      await this.transitionBacklog(jiraUrl);
    }
    return true;
  }
}

export { Jira };
