package mock

import (
	"reflect"
	"testing"

	"golang.org/x/net/context"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/srclib/graph"
	"sourcegraph.com/sqs/pbtypes"
)

func (s *DefsServer) MockGet(t *testing.T, wantDef sourcegraph.DefSpec) (called *bool) {
	called = new(bool)
	s.Get_ = func(ctx context.Context, op *sourcegraph.DefsGetOp) (*sourcegraph.Def, error) {
		*called = true
		def := op.Def
		if def != wantDef {
			t.Errorf("got def %+v, want %+v", def, wantDef)
			return nil, grpc.Errorf(codes.NotFound, "def %v not found", wantDef)
		}
		return &sourcegraph.Def{Def: graph.Def{DefKey: def.DefKey("r")}}, nil
	}
	return
}

func (s *DefsServer) MockGet_Return(t *testing.T, wantDef *sourcegraph.Def) (called *bool) {
	called = new(bool)
	s.Get_ = func(ctx context.Context, op *sourcegraph.DefsGetOp) (*sourcegraph.Def, error) {
		*called = true
		def := op.Def
		if def != wantDef.DefSpec(def.Repo) {
			t.Errorf("got def %+v, want %+v", def, wantDef.DefSpec(def.Repo))
			return nil, grpc.Errorf(codes.NotFound, "def %v not found", wantDef.DefKey)
		}
		return wantDef, nil
	}
	return
}

func (s *DefsServer) MockList(t *testing.T, wantDefs ...*sourcegraph.Def) (called *bool) {
	called = new(bool)
	s.List_ = func(ctx context.Context, opt *sourcegraph.DefListOptions) (*sourcegraph.DefList, error) {
		*called = true
		return &sourcegraph.DefList{Defs: wantDefs}, nil
	}
	return
}

func (s *DefsServer) MockRefreshIndex(t *testing.T, wantOp *sourcegraph.DefsRefreshIndexOp) (called *bool) {
	called = new(bool)
	s.RefreshIndex_ = func(ctx context.Context, op *sourcegraph.DefsRefreshIndexOp) (*pbtypes.Void, error) {
		*called = true
		if !reflect.DeepEqual(op, wantOp) {
			t.Fatalf("unexpected DefsRefreshIndexOp, got %+v != %+v", op, wantOp)
		}
		return &pbtypes.Void{}, nil
	}
	return
}
