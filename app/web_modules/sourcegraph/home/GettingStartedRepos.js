// initially copied from user/settings/repos.js

import React from "react";
import RepoLink from "sourcegraph/components/RepoLink";
import CSSModules from "react-css-modules";
import styles from "sourcegraph/home/styles/GettingStarted.css";
import base from "sourcegraph/components/styles/_base.css";
import {Input, Table, CheckboxList} from "sourcegraph/components";
import debounce from "lodash.debounce";
import GitHubAuthButton from "sourcegraph/components/GitHubAuthButton";
import {privateGitHubOAuthScopes} from "sourcegraph/util/urlTo";
import {Button} from "sourcegraph/components";

class GettingStartedRepos extends React.Component {
	static propTypes = {
		repos: React.PropTypes.arrayOf(React.PropTypes.object),
		location: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		signedIn: React.PropTypes.bool.isRequired,
		githubToken: React.PropTypes.object,
		eventLogger: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this._filterInput = null;
		this._handleFilter = this._handleFilter.bind(this);
		this._handleFilter = debounce(this._handleFilter, 25);
		this._showRepo = this._showRepo.bind(this);
	}

	// _repoSort is a comparison function that sorts more recently
	// pushed repos first.
	_repoSort(a, b) {
		if (a.PushedAt < b.PushedAt) return 1;
		else if (a.PushedAt > b.PushedAt) return -1;
		return 0;
	}

	_handleFilter() {
		this.forceUpdate();
	}

	_showRepo(repo) {
		if (this._filterInput && this._filterInput.value &&
			this._qualifiedName(repo).indexOf(this._filterInput.value.trim().toLowerCase()) === -1) {
			return false;
		}
		return true; // no filter; return all
	}

	_qualifiedName(repo) {
		return (`${repo.Owner}/${repo.Name}`).toLowerCase();
	}

	_hasGithubToken() {
		return this.context && this.context.githubToken;
	}

	_hasPrivateGitHubToken() {
		return this.context.githubToken && this.context.githubToken.scope && this.context.githubToken.scope.includes("repo") && this.context.githubToken.scope.includes("read:org") && this.context.githubToken.scope.includes("user:email");
	}

	_sendForm(ev) {
		ev.preventDefault();
		let reposToIndex = [];
		let repoList = ev.currentTarget.children[0].childNodes;
		console.log(repoList);
		for (let i = 0; i < repoList.length; i++) {
			if (repoList[i].childNodes[3].checked === true) {
				reposToIndex.push(repoList[i].id);
			}
		}
		console.log(reposToIndex);
	}

	render() {
		let test = {
			Private: true,
			URI: "someURL",
			Description: "this is private",
			UpdatedAt: "2016-02-24T10:18:55-08:00",
			Language: "Go",
		};

		let test1 = {
			Private: true,
			URI: "someURL",
			Description: "this is also private",
			UpdatedAt: "2016-02-24T10:18:55-08:00",
			Language: "Go",
		};

		let test2 = {
			Private: false,
			URI: "someURL",
			Description: "this is public",
			UpdatedAt: "2016-02-24T10:18:55-08:00",
			Language: "Go",
		};

		let repos = (this.props.repos || []).filter(this._showRepo).sort(this._repoSort);
		//repos.push(test);
		//repos.push(test1);
		//repos.push(test2);
		//repos = repos.filter(this._showRepo);

		return (
			<div className={base.pb4}>
				<form onSubmit={this._sendForm.bind(this)}>
					<div>
						{repos.length > 0 && repos.map((repo, i) =>
							<span key={i} id={repo.URI}> <input type="checkbox"/>
								<label>
								<RepoLink styleName="repo-link" repo={repo.URI || `github.com/${repo.Owner}/${repo.Name}`} />
								{repo.Description && <p styleName="description">{repo.Description}</p>}
								<p/>
								</label>
							</span>
						)}
					</div>
					<div>
						{repos.length > 0 && repos.map &&
							<Button className="submit-button" type="submit"> Submit </Button>
						}
					</div>
					<div>
						{this._hasGithubToken() && repos.length === 0 && (!this._filterInput || !this._filterInput.value) &&
							<p styleName="indicator">Loading...</p>
						}

						{this._hasGithubToken() && this._filterInput && this._filterInput.value && repos.length === 0 &&
							<p styleName="indicator">No matching repositories</p>
						}
					</div>
				</form>
			</div>
		);
	}
}
					// search repos:
					// <div styleName="input-bar">
					// 	{this._hasGithubToken() && <Input type="text"
					// 		placeholder="Find a repository..."
					// 		domRef={(e) => this._filterInput = e}
					// 		spellCheck={false}
					// 		styleName="filter-input"
					// 		onChange={this._handleFilter} />}
					// </div>

export default CSSModules(GettingStartedRepos, styles, {allowMultiple: true});
