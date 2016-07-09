package javascript

import "sourcegraph.com/sourcegraph/sourcegraph/lang"

func init() {
	// TODO(sqs): hacky, since this server IS actually a separate
	// process.
	lang.Langs["JavaScript"] = "localhost:50051"
}
