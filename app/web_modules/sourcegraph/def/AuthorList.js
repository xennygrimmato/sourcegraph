// @flow

import React from "react";
import TimeAgo from "sourcegraph/util/TimeAgo";
import {Avatar} from "sourcegraph/components";
import type {DefAuthor} from "sourcegraph/def";
import CSSModules from "react-css-modules";
import styles from "./styles/AuthorList.css";

function pct(a: DefAuthor): string {
	return `${Math.round(100 * a.BytesProportion) || "< 1"}%`;
}

export default CSSModules(function AuthorList({
	authors,
	horizontal = false,
	className,
}: {
	authors: Array<DefAuthor>,
	horizontal: bool,
	className?: string,
}) {
	const small = horizontal; // treat these as the same for now
	return (
		<div className={className}>
			{authors && authors.length > 0 &&
				<ol styleName={`list-${horizontal ? "horizontal" : "vertical"}`}>
					{authors.map((a, i) => (
						<li key={i} styleName={`person${horizontal ? "-horizontal" : ""}`}
							title={`${a.Email} authored ${pct(a)}, last commit ${a.LastCommitDate}`}>
							{!small && <div styleName="badge-wrapper">
								<span styleName="badge">{pct(a)}</span>
							</div>}
							<Avatar styleName={`avatar-${horizontal ? "horizontal" : "vertical"}`} size="tiny" img={a.AvatarURL} />
							{!small && a.Email}
							{!small && <TimeAgo time={a.LastCommitDate} styleName="timestamp" />}
						</li>
					))}
				</ol>
			}
		</div>
	);
}, styles);

