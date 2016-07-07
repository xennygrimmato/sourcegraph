package golang

import (
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

func init() {
	lang.InProcessIndexersByLang["Go"] = indexer{}
}

type indexer struct{}

func (indexer) Index(ctx context.Context, op *lang.IndexOp) (*lang.IndexResult, error) {
	return index(op)
}
