package golang

import (
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

func (s *langServer) Sel(ctx context.Context, op *lang.SelOp) (*lang.SelResult, error) {
	res, err := s.Refs(ctx, &lang.RefsOp{
		Sources: op.Sources,
		Origins: []*lang.RefsOp_FileSpan{{File: op.Origin, Span: op.Span}},
		Config:  op.Config,
	})
	if err != nil {
		return nil, err
	}

	targets := make([]*lang.Target, len(res.Files[op.Origin].Refs))
	for i, ref := range res.Files[op.Origin].Refs {
		targets[i] = ref.Target
	}

	return &lang.SelResult{
		Defs:     targets,
		Messages: res.Messages,
		Complete: res.Complete,
	}, nil
}
