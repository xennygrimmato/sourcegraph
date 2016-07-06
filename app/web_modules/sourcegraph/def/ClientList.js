// @flow

import React from "react";
import {Link} from "react-router";
import {Avatar} from "sourcegraph/components";
import type {DefClient} from "sourcegraph/def";
import CSSModules from "react-css-modules";
import styles from "./styles/PersonList.css";

export default CSSModules(function ClientList({
	clients,
	horizontal = false,
	className,
	urlForClient,
}: {
	clients: Array<DefClient>,
	horizontal: bool,
	className?: string,
	urlForClient: (email: string) => string,
}) {
	return (
		<div className={className}>
			{clients && clients.length > 0 &&
				<ol styleName={`list-${horizontal ? "horizontal" : "vertical"}`}>
					{clients.map((c, i) => (
						<li key={i} styleName={`person${horizontal ? "-horizontal" : ""}`}
							title={`${c.Email} used ${c.Refs.length}x, most recently ${c.LastCommitDate}`}>
							<Link to={urlForClient(c.Email)}>
								<Avatar styleName={`avatar-${horizontal ? "horizontal" : "vertical"}`} size="tiny" img={c.AvatarURL} />
							</Link>
						</li>
					))}
				</ol>
			}
		</div>
	);
}, styles);

