
import React from "react";
import Header from "sourcegraph/components/Header";
import type {Route} from "react-router";
import styles from "./styles/index.css";

class Channel extends React.Component {
	static propTypes = {
		location: React.PropTypes.object.isRequired,
		params: React.PropTypes.object.isRequired,
	};

	static contextTypes = {
		router: React.PropTypes.object.isRequired,
		features: React.PropTypes.object.isRequired,
	};

	constructor(props) {
		super(props);
		this.state = {takingAWhile: false};
	}

	componentDidMount() {
		this._timeout = setTimeout(() => {
			this.setState({takingAWhile: true});
		}, 3000);

		if (this.props.params.channel) {
			// Add channel to location state. withChannelListener will
			// notice this and respond to actions sent on that channel.
			this.context.router.replace({
				...this.props.location,
				state: {
					...this.props.location.state,
					channel: this.props.params.channel,
				},
			});
		}
	}

	componentWillUnmount() {
		if (this._timeout) clearTimeout(this._timeout);
	}

	render() {
		if (this.props.location.state && this.props.location.state.error && this.props.location.state.fix) {
			return (
				<div className={styles.error}>
				<Header title={this.props.location.state.error}
					subtitle={this.props.location.state.fix} />
				<a href="https://github.com/sourcegraph/sourcegraph-sublime" className={styles.readme}>Sourcegraph Sublime README</a>
				</div>
			);
		}

		return (
			<div>
			<Header title="Click on a symbol in your editor to get started!"/>
			<body>
				<div>
					<div className={styles.explanationheader}>
						<p> Some helpful links: </p>
					</div>
					<div className={styles.explanation}>
						<p> Try an example search of <a href="https://sourcegraph.com/github.com/golang/go/-/info/GoPackage/fmt/-/Sprintf?utm_source=sourcegraph-editor">sprintf</a> in Go. </p>
						<p> Sign in to Sourcegraph to try global <a href="https://sourcegraph.com/search">search</a>. </p>
						<p> Search local repos by <a href="https://sourcegraph.com/repositories">adding your repo</a> to Sourcegraph. </p> 
					</div>
				</div>
			</body>
			</div>
		);
	}
}

export const routes: Array<Route> = [
	{
		path: "-/channel/:channel",
		components: {
			main: Channel,
		},
	},

	// Backcompat redirect for old /-/live/:channel URLs.
	//
	// Remove this soon as the old URL was used only for limited testing.
	{
		path: "-/live/:channel",
		onEnter: (nextState, replace) => {
			replace({...nextState.location, pathname: nextState.location.pathname.replace("/-/live/", "/-/channel/")});
		},
	},
];
