package javascript

import (
	"sync"

	"golang.org/x/net/context"
	"google.golang.org/grpc"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

func init() {
	// TODO(sqs): hacky, since this server IS actually a separate
	// process.
	lang.InProcessIndexersByLang["JavaScript"] = indexer{}
}

type indexer struct{}

func (indexer) Index(ctx context.Context, op *lang.IndexOp) (*lang.IndexResult, error) {
	// TODO(sqs): as mentioned in `func init`, this is hacky since
	// this server IS actually a separate process.

	conn, err := getConn()
	if err != nil {
		return nil, err
	}

	cl := lang.NewIndexerClient(conn)
	return cl.Index(ctx, op)
}

func getConn() (*grpc.ClientConn, error) {
	connMu.Lock()
	defer connMu.Unlock()

	if conn == nil {
		var err error
		conn, err = grpc.Dial("localhost:50051", grpc.WithInsecure(), grpc.WithCodec(sourcegraph.GRPCCodec))
		if err != nil {
			return nil, err
		}
	}
	return conn, nil
}

var (
	connMu sync.Mutex
	conn   *grpc.ClientConn
)
