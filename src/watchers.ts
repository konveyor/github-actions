import * as core from '@actions/core';
import axios from 'axios';

class JiraWatcherManager {
  private jiraIssueUrl: string;
  private botToken: string;
  private issueKey: string;
  private addWatchers: string[];

  constructor(jiraIssueUrl: string, botToken: string) {
    const addWatchers = core.getInput('addWatchers');
    core.debug(`Raw addWatchers: "${addWatchers}"`);
    this.addWatchers = addWatchers ?
      addWatchers.split(',') : [];

    this.jiraIssueUrl = jiraIssueUrl;
    this.botToken = botToken;
    this.issueKey = '';
  }

  private async getJiraIssueKeyFromUrl(url: string): Promise<string> {
    const issueInfoUrl = `${url}?fields=key`;
    core.info(`Info url: ${issueInfoUrl}`);
    const {
      data: { key },
    } = await axios.get(issueInfoUrl, {
      headers: { Authorization: `Bearer ${this.botToken}` },
    });

    return key;
  }

  private async watchersUrl() {
    if(this.issueKey == '') {
      const issueKey = await this.getJiraIssueKeyFromUrl(this.jiraIssueUrl);
      this.issueKey = issueKey;
    }

    const bu = core.getInput("jiraBaseUrl");
    return `${bu}/rest/api/2/issue/${this.issueKey}/watchers`;
  }


  private async getJiraIssueWatchers(): Promise<string[]> {
    const watchersUrl = await this.watchersUrl();
    const watcherResponse = await axios.get(watchersUrl, {
      headers: { Authorization: `Bearer ${this.botToken}` },
    });
    return watcherResponse.data.watchers.map(m => m.emailAddress);
  }

  private async setRemoteWatcher(watcherEmail: string) {
    const watchersUrl = await this.watchersUrl();
    const reqBody = `"${watcherEmail}"`;

    // Wrap error with email that failed so it can be reported by consumer
    return new Promise((resolve, reject) => {
      axios.post(watchersUrl, reqBody, {
        headers: {
          'Authorization': `Bearer ${this.botToken}`,
          'Content-Type': 'application/json',
        },
      })
      .then(() => resolve({email: watcherEmail, error: null}))
      .catch(err => reject({email: watcherEmail, error: err}));
    });
  }

  private async setRemoteWatchers(watcherEmails: string[]) {
    // Send independent watch requests in parallel. We don't care if some
    // fail because none of the requests depend upon one another. Gate on
    // all requests concluding with Promise.allSettled, and parse the results.
    // The "Add Watcher" endpoint returns nothing; it just indicates the result
    // via status code.
    // I've seen several possible:
    // 204 - It's present -- no indication if it wasn't there already, idempotent
    // 400 - These are thrown for some reason if someone doesn't have privileges
    // and often there's very little information (if any) about why
    // 404 - Just a bad URL
    // 415 - Missing Content-Type header
    const results = await Promise.allSettled(
      watcherEmails.map(email => this.setRemoteWatcher(email))
    );

    // Annoyingly Typescript has no way to understand what's in the results
    // array, so this actually requires a cast
    const failures = (results.filter(res =>res.status === 'rejected'
      ) as PromiseRejectedResult[]);

    if(failures.length != 0) {
      core.warning(`Failed to add ${failures.length} watchers:`)
      failures.forEach(err => core.error(JSON.stringify(err)));
    }
  }

  async ensureDesiredWatchers() {
    if(this.addWatchers.length === 0) {
      core.info('No desired watchers have been configured and none will be added');
      return
    }

    core.debug('Ensuring desired watchers');
    core.debug(JSON.stringify(this.addWatchers));
    const currentWatchers = await this.getJiraIssueWatchers();
    core.debug('Current watcher list:')
    core.debug(JSON.stringify(currentWatchers));

    const watchersToAdd : string [] = this.addWatchers.reduce((toAdd : string[], d) => {
      return currentWatchers.includes(d) ? toAdd : [...toAdd, d];
    }, []);

    core.info('Adding missing watchers:')
    core.info(JSON.stringify(watchersToAdd));

    await this.setRemoteWatchers(watchersToAdd)
  }
}

export { JiraWatcherManager };
