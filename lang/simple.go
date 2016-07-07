package lang

import "golang.org/x/net/context"

// InProcessIndexers is an in-process Go interface that matches the
// protobuf Indexer service.
//
// TMP: Used to avoid the overhead of spinning up a gRPC server and
// client when both sides of the connection are in Go (as they are for
// this prototype).
type InProcessIndexer interface {
	Index(context.Context, *IndexOp) (*IndexResult, error)
}

// InProcessIndexersByLang is inserted into at init time by other
// packages that define InProcessIndexer implementations. The map key
// is the language name from the pkg/inventory/filelang package's
// database.
var InProcessIndexersByLang = map[string]InProcessIndexer{}
