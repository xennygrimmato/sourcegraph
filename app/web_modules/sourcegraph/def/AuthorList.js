// @flow weak

import React from "react";
import {Avatar} from "sourcegraph/components";

import CSSModules from "react-css-modules";
import styles from "./styles/AuthorList.css";

class AuthorList extends React.Component {
	static propTypes = {
		authors: React.PropTypes.object.isRequired,
		horizontal: React.PropTypes.bool,
		className: React.PropTypes.string,
	};

	render() {
		let authors = this.props.authors ? this.props.authors.DefAuthors || [] : null;

		return (
			<div className={this.props.className}>
				{authors && authors.length === 0 &&
					<i>No authors found</i>
				}
				{authors && authors.length > 0 &&
					<div styleName={`list${this.props.horizontal ? "-horizontal": ""}-container`}>
						<ol styleName={`list${this.props.horizontal ? "-horizontal" : ""}`}>
							{authors.map((a, i) => (
								<li key={i} styleName={`person${this.props.horizontal ? "-horizontal" : ""}`}>
									<Avatar styleName="avatar" size="tiny" img={a.AvatarURL} />
								</li>
							))}
							<li>
								<span>{authors.length} contributor{(authors.length > 1) ? "s" : null} </span>
							</li>
						</ol>
					</div>
				}
			</div>
		);
	}
}

export default CSSModules(AuthorList, styles);
