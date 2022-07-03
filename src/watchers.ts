import * as core from '@actions/core';
import axios from 'axios';

class JiraWatcherManager {
  private jiraIssueUrl: string;
  private botToken: string;
  private issueKey: string;
  private desiredWatchers: string[];

  constructor(jiraIssueUrl: string, botToken: string) {
    ////////////////////////////////////////////////////////////////////////////
    // TODO: I originally had this in a dat/desired-watchers.json file, but to
    // my surprise, this json file got dropped into the lib directory without
    // actually updating with my edits to the src/ json file. This will result
    // in less surprises, but this should get parameterized in a manner that's
    // easily changed, or perhaps consumed by the environment
    // NOTE: For unknown reasons, ernelson@redhat.com can be added as a watcher
    // to any project=MTRHO issue. migeng-robot@redhat.com will result in a 400
    // error. I have attempted to authorize with a token as both ernelson@redhat.com
    // and migeng-robot@redhat.com thinking that maybe the API would only allow
    // for the authenticating user to add themselves and not anyone else, but
    // that does not appear to be the case. Both of these users have the project
    // permission, inherited via the Administrators group, to manager watchers
    // other than themselves. Need to dig into this if we want to add other users
    // here. The exact permissions necessary should be documented.
    this.desiredWatchers = [
      'ernelson@redhat.com',
    ];
    ////////////////////////////////////////////////////////////////////////////

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
      core.error(`Failed to add ${failures.length} watchers:`)
      failures.forEach(err => core.error(JSON.stringify(err)));
    }
  }

  async ensureDesiredWatchers() {
    core.info('Ensuring desired watchers');
    core.info('Desired watcher list:');
    core.info(JSON.stringify(this.desiredWatchers));
    const currentWatchers = await this.getJiraIssueWatchers();
    core.info('Current watcher list:')
    core.info(JSON.stringify(currentWatchers));

    const watchersToAdd : string [] = this.desiredWatchers.reduce((toAdd : string[], d) => {
      return currentWatchers.includes(d) ? toAdd : [...toAdd, d];
    }, []);

    core.info('Adding missing watchers:')
    core.info(JSON.stringify(watchersToAdd));

    await this.setRemoteWatchers(watchersToAdd)
  }
}

export { JiraWatcherManager };
