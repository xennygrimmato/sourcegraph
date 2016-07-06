// @flow

import React from "react";
import {Link} from "react-router";
import TimeAgo from "sourcegraph/util/TimeAgo";
import {Avatar} from "sourcegraph/components";
import type {DefAuthor} from "sourcegraph/def";
import CSSModules from "react-css-modules";
import styles from "./styles/PersonList.css";

function pct(a: DefAuthor): string {
	return `${Math.round(100 * a.BytesProportion) || "< 1"}%`;
}

export default CSSModules(function AuthorList({
	authors,
	horizontal = false,
	className,
	urlForCommit,
}: {
	authors: Array<DefAuthor>,
	horizontal: bool,
	className?: string,
	urlForCommit: (commitID: string) => string,
}) {
	const small = horizontal; // treat these as the same for now
	return (
		<div className={className}>
			{authors && authors.length > 0 &&
				<ol styleName={`list-${horizontal ? "horizontal" : "vertical"}`}>
					{authors.map((a, i) => (
						<li key={i} styleName={`person${horizontal ? "-horizontal" : ""}`}
							title={`${a.Email} authored ${pct(a)}, last commit ${a.LastCommitDate}`}>
							<Link to={urlForCommit(a.LastCommitID)}>
								{!small && <div styleName="badge-wrapper">
									<span styleName="badge">{pct(a)}</span>
								</div>}
								<Avatar styleName={`avatar-${horizontal ? "horizontal" : "vertical"}`} size="tiny" img={a.AvatarURL} />
								{!small && a.Email}
								{!small && <TimeAgo time={a.LastCommitDate} styleName="timestamp" />}
							</Link>
						</li>
					))}
				</ol>
			}
		</div>
	);
}, styles);

