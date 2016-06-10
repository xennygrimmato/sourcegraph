// @flow weak
import Dispatcher from "sourcegraph/Dispatcher";
import {defaultFetch, checkStatus} from "sourcegraph/util/xhr";
import {trackPromise} from "sourcegraph/app/status";
import {singleflightFetch} from "sourcegraph/util/singleflightFetch";
import EventLogger from "sourcegraph/util/EventLogger";

export class FormSignup {
	constructor(list_id, data) {
		this.data = data;
		this.list_id = list_id;
	}
}

const HomeBackend = {
	fetch: singleflightFetch(defaultFetch),

	__onDispatch(action) {
		switch (action.constructor) {

		case FormSignup:
			{
				trackPromise(
					HomeBackend.fetch(`/.api/form/${action.list_id}`)
						.then(checkStatus)
						.then((resp) => resp.json())
						.catch((err) => ({Error: err}))
				);
				break;
			}
		}
	},
};

Dispatcher.Backends.register(HomeBackend.__onDispatch);

export default HomeBackend;
export default FormSignup;
