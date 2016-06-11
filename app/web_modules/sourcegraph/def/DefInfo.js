// @flow weak

import React from "react";
import Helmet from "react-helmet";
import AuthorList from "sourcegraph/def/AuthorList";
import Container from "sourcegraph/Container";
import DefStore from "sourcegraph/def/DefStore";
import RefsContainer from "sourcegraph/def/RefsContainer";
import {RefLocsPerPage} from "sourcegraph/def";
import {Button} from "sourcegraph/components";
import {Link} from "react-router";
import "sourcegraph/blob/BlobBackend";
import Dispatcher from "sourcegraph/Dispatcher";
import * as DefActions from "sourcegraph/def/DefActions";
import {urlToDef} from "sourcegraph/def/routes";
import CSSModules from "react-css-modules";
import styles from "./styles/DefInfo.css";
import base from "sourcegraph/components/styles/_base.css";
import colors from "sourcegraph/components/styles/_colors.css";
import {qualifiedNameAndType} from "sourcegraph/def/Formatter";
import Header from "sourcegraph/components/Header";
import httpStatusCode from "sourcegraph/util/httpStatusCode";
import {trimRepo} from "sourcegraph/repo";
import {defTitle, defTitleOK} from "sourcegraph/def/Formatter";
import "whatwg-fetch";
import {GlobeIcon, LanguageIcon} from "sourcegraph/components/Icons";
import {Dropdown} from "sourcegraph/components";

class DefInfo extends Container {
	static contextTypes = {
		router: React.PropTypes.object.isRequired,
		features: React.PropTypes.object.isRequired,
		eventLogger: React.PropTypes.object.isRequired,
	};

	static propTypes = {
		repo: React.PropTypes.string,
		repoObj: React.PropTypes.object,
		def: React.PropTypes.string.isRequired,
		commitID: React.PropTypes.string,
		rev: React.PropTypes.string,
	};

	constructor(props) {
		super(props);
		this.state = {
			currPage: 1,
			nextPageLoading: false,
			currentLang: localStorage.getItem("defInfoCurrentLang"),
			translations: {},
			defDescrHidden: null,
			descrCutoff: 500,
		};
		this._onNextPage = this._onNextPage.bind(this);
		this._onTranslateDefInfo = this._onTranslateDefInfo.bind(this);
		this.splitHTMLDescr = this.splitHTMLDescr.bind(this);
		this.splitPlainDescr = this.splitPlainDescr.bind(this);
		this._onViewMore = this._onViewMore.bind(this);
		this._onViewLess = this._onViewLess.bind(this);
	}

	stores() {
		return [DefStore];
	}

	componentDidMount() {
		if (super.componentDidMount) super.componentDidMount();
		// Fix a bug where navigating from a blob page here does not cause the
		// browser to scroll to the top of this page.
		if (typeof window !== "undefined") window.scrollTo(0, 0);
	}

	shouldHideDescr(defObj, cutOff) {
		if (defObj.DocHTML) {
			let parser = new DOMParser();
			let doc = parser.parseFromString(defObj.DocHTML.__html, "text/html");
			return doc.documentElement.textContent.length >= cutOff;
		}
		return defObj.Docs[0].Data.length >= cutOff;
	}

	splitHTMLDescr(html, cutOff) {
		let parser = new DOMParser();
		let doc = parser.parseFromString(html, "text/html");

		function lp(node, oldLength) {
			let childrenCopy = [];
			while (node.firstChild) {
				let clone = node.firstChild.cloneNode(true);
				childrenCopy.push(clone);
				node.removeChild(node.firstChild);
			}

			let newLength = node.textContent.length + oldLength;
			if (newLength >= cutOff) {
				node.textContent = `${node.textContent.slice(0, cutOff - node.textContent.length - 1)}...`;
				return [node, cutOff];
			}

			let latestLength = newLength;
			for (let child of childrenCopy) {
				let [newChild, newCount] = lp(child, latestLength);
				node.appendChild(newChild);
				latestLength = newCount;
				if (latestLength >= cutOff) {
					break;
				}
			}
			return [node, latestLength];
		}
		let newDoc = lp(doc.documentElement, 0)[0];
		return newDoc.getElementsByTagName("body")[0].innerHTML;
	}

	splitPlainDescr(txt, cutOff) {
		return txt.slice(0, Math.min(txt.length, cutOff));
	}

	_onViewMore() {
		this.setState({defDescrHidden: false});
	}

	_onViewLess() {
		this.setState({defDescrHidden: true});
	}


	reconcileState(state, props) {
		state.repo = props.repo || null;
		state.rev = props.rev || null;
		state.def = props.def || null;
		state.defObj = props.defObj || null;
		state.defCommitID = props.defObj ? props.defObj.CommitID : null;
		state.authors = state.defObj ? DefStore.authors.get(state.repo, state.defObj.CommitID, state.def) : null;

		state.refLocations = state.def ? DefStore.getRefLocations({
			repo: state.repo, commitID: state.commitID, def: state.def, repos: [],
		}) : null;
		if (state.refLocations && state.refLocations.PagesFetched >= state.currPage) {
			state.nextPageLoading = false;
		}
		if (state.defObj && state.defDescrHidden === null) {
			state.defDescrHidden = this.shouldHideDescr(state.defObj, state.descrCutoff);
		}
	}

	onStateTransition(prevState, nextState) {
		if (nextState.currPage !== prevState.currPage || nextState.repo !== prevState.repo || nextState.rev !== prevState.rev || nextState.def !== prevState.def) {
			Dispatcher.Backends.dispatch(new DefActions.WantRefLocations({
				repo: nextState.repo, commitID: nextState.commitID, def: nextState.def, repos: [], page: nextState.currPage,
			}));
		}

		if (prevState.defCommitID !== nextState.defCommitID && nextState.defCommitID) {
			if (this.context.features.Authors) {
				Dispatcher.Backends.dispatch(new DefActions.WantDefAuthors(nextState.repo, nextState.defCommitID, nextState.def));
			}
		}
	}

	_onTranslateDefInfo(val) {
		let $this = this;
		let def = $this.state.defObj;
		let apiKey = "AIzaSyCKati7PcEa2fqyuoDDwd1ujXiBVOddwf4";
		let targetLang = val;

		if ($this.state.translations[targetLang]) {
			// Toggle when target language is same as the current one,
			// otherwise change the current language and force to show the result.
			if ($this.state.currentLang === targetLang) {
				$this.setState({showTranslatedString: !$this.state.showTranslatedString});
			} else {
				$this.setState({
					currentLang: targetLang,
					translatedString: $this.state.translations[targetLang],
					showTranslatedString: true,
				});
			}

		} else {
			// Fetch translation result when does not exist with given target language
			fetch(`https://www.googleapis.com/language/translate/v2?key=${apiKey}&target=${targetLang}&q=${encodeURIComponent(def.DocHTML.__html)}`)
				.then((response) => response.json())
				.then(function(json) {
					let translation = json.data.translations[0].translatedText;
					$this.setState({
						currentLang: targetLang,
						translations: {...$this.state.translations, [targetLang]: translation},
						showTranslatedString: true,
					});
				});
		}

		localStorage.setItem("defInfoCurrentLang", targetLang);
	}

	_onNextPage() {
		let nextPage = this.state.currPage + 1;
		this.setState({currPage: nextPage, nextPageLoading: true});
		this.context.eventLogger.logEvent("RefsPaginatorClicked", {page: nextPage});
	}

	render() {
		let def = this.state.defObj;
		let hiddenDescr = this.state.defDescrHidden;
		let cutOff = this.state.descrCutoff;
		let refLocs = this.state.refLocations;
		let authors = this.state.authors;
		let fileCount = refLocs && refLocs.RepoRefs ?
			refLocs.RepoRefs.reduce((total, refs) => total + refs.Files.length, refLocs.RepoRefs[0].Files.length) : 0;
		if (refLocs && refLocs.Error) {
			return (
				<Header
					title={`${httpStatusCode(refLocs.Error)}`}
					subtitle={`References are not available.`} />
			);
		}
		return (
			<div styleName="container">
			{/* NOTE: This should (roughly) be kept in sync with page titles in app/internal/ui. */}
				<Helmet title={defTitleOK(def) ? `${defTitle(def)} · ${trimRepo(this.state.repo)}` : trimRepo(this.state.repo)} />
				{def &&
					<h1 styleName="def-header">
						<Link title="View definition in code" to={urlToDef(def, this.state.rev)} className={`${colors["mid-gray"]}`}>
							<code styleName="def-title">{qualifiedNameAndType(def, {unqualifiedNameClass: styles.def})}</code>
						</Link>
					</h1>
				}
				<div>
					{authors && Object.keys(authors).length > 0 && <AuthorList authors={authors} horizontal={true} styleName="authors"/>}
					{def && def.DocHTML &&
						<div styleName="description-wrapper">
							<Dropdown
								styleName="translation-widget"
								className={base.mt0}
								icon={<GlobeIcon styleName="icon" />}
								title="Translate"
								initialValue={this.state.currentLang}
								disabled={this.state.repoObj ? this.state.repoObj.Private : false}
								onMenuClick={(val) => this._onTranslateDefInfo(val)}
								onItemClick={(val) => this._onTranslateDefInfo(val)}
								items={[
									{name: "English", value: "en"},
									{name: "简体中文", value: "zh-CN"},
									{name: "繁體中文", value: "zh-TW"},
									{name: "日本語", value: "ja"},
									{name: "Français", value: "fr"},
									{name: "Español", value: "es"},
									{name: "Русский", value: "ru"},
									{name: "Italiano", value: "it"},
								]} />

							{this.state.showTranslatedString &&
								<div>
									<LanguageIcon styleName="icon" />
									<div styleName="description" dangerouslySetInnerHTML={{__html: this.state.translations[this.state.currentLang]}}></div>
								</div>
							}
							{this.state.showTranslatedString &&
								<hr/>
							}
					<h3>DocString</h3>
							<div styleName="description"
								dangerouslySetInnerHTML={hiddenDescr && {__html: this.splitHTMLDescr(def.DocHTML.__html, cutOff)} || def.DocHTML}></div>
							{hiddenDescr && <div styleName="description-expander" onClick={this._onViewMore}>View More...</div>}
							{!hiddenDescr && this.shouldHideDescr(def, cutOff) && <div styleName="description-expander" onClick={this._onViewLess}>Collapse</div>}
					</div>
					}
					{/* TODO DocHTML will not be set if the this def was loaded via the
						serveDefs endpoint instead of the serveDef endpoint. In this case
						we'll fallback to displaying plain text. We should be able to
						sanitize/render DocHTML on the front-end to make this consistent.
					*/}

				{def && !def.DocHTML && def.Docs && def.Docs.length &&
							<div styleName="description-wrapper">
								<div styleName="description">{hiddenDescr && this.splitPlainDescr(def.Docs[0].Data, cutOff) || def.Docs[0].Data}</div>
								{hiddenDescr && <div onClick={this._onViewMore}>View More...</div>}
							</div>
						}

					{def && !def.Error &&
						<div>
							{!refLocs && <i>Loading...</i>}
							{refLocs && refLocs.TotalRepos &&
								<h3 styleName="section-label">
									Referenced in {refLocs.TotalRepos} repositor{refLocs.TotalRepos === 1 ? "y" : "ies"}
								</h3>
							}
							{refLocs && !refLocs.TotalRepos && refLocs.RepoRefs &&
								<h3 styleName="section-label">
									Used in {refLocs.RepoRefs.length}+ repositories
								</h3>
							}
							{refLocs && refLocs.RepoRefs && refLocs.RepoRefs.map((repoRefs, i) => <RefsContainer
								key={i}
								repo={this.props.repo}
								rev={this.props.rev}
								commitID={this.props.commitID}
								def={this.props.def}
								defObj={this.props.defObj}
								repoRefs={repoRefs}
								prefetch={i === 0}
								initNumSnippets={i === 0 ? 1 : 0}
								fileCollapseThreshold={5} />)}
						</div>
					}
				</div>
				{/* Display the paginator if we have more files repos or repos to show. */}
				{refLocs && refLocs.RepoRefs &&
					(fileCount >= RefLocsPerPage || refLocs.TotalRepos > refLocs.RepoRefs.length || !refLocs.TotalRepos) &&
					!refLocs.StreamTerminated &&
					<div styleName="pagination">
						<Button color="blue" loading={this.state.nextPageLoading} onClick={this._onNextPage}>View More</Button>
					</div>
				}
			</div>
		);
	}
}

export default CSSModules(DefInfo, styles);
