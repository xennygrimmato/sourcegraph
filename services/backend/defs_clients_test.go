package backend

import (
	"reflect"
	"testing"
	"time"

	"golang.org/x/net/context"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/srclib/graph"
	"sourcegraph.com/sqs/pbtypes"
)

func TestDefsService_ListClients(t *testing.T) {
	var s defs
	ctx, mock := testContext()

	t1 := pbtypes.NewTimestamp(time.Unix(12345, 0).In(time.UTC))

	ref1 := &graph.Ref{
		DefRepo: "r", DefUnitType: "t", DefUnit: "u", DefPath: "p", Repo: "r2",
		CommitID: "c", File: "f2", Start: 10, End: 20,
	}
	ref2 := &graph.Ref{
		DefRepo: "r", DefUnitType: "t", DefUnit: "u", DefPath: "p", Repo: "r3",
		CommitID: "c", File: "f3", Start: 20, End: 30,
	}

	want := []*sourcegraph.DefClient{
		{
			Email: "a@a.com",
			AuthorshipInfo: sourcegraph.AuthorshipInfo{
				LastCommitDate: t1,
				LastCommitID:   "c2",
			},
			Refs: []*graph.Ref{ref1},
		},
		{
			Email: "b@b.com",
			AuthorshipInfo: sourcegraph.AuthorshipInfo{
				LastCommitDate: t1,
				LastCommitID:   "c",
			},
			Refs: []*graph.Ref{ref2},
		},
	}

	defSpec := sourcegraph.DefSpec{CommitID: "c", UnitType: "t", Unit: "u", Path: "p"}

	mock.servers.Defs.ListRefs_ = func(ctx context.Context, op *sourcegraph.DefsListRefsOp) (*sourcegraph.RefList, error) {
		return &sourcegraph.RefList{
			Refs: []*graph.Ref{ref1, ref2},
			Authors: []*sourcegraph.RefAuthor{
				{
					Email:          "a@a.com",
					AuthorshipInfo: sourcegraph.AuthorshipInfo{LastCommitID: "c2", LastCommitDate: t1},
				},
				{
					Email:          "b@b.com",
					AuthorshipInfo: sourcegraph.AuthorshipInfo{LastCommitID: "c", LastCommitDate: t1},
				},
			},
		}, nil
	}

	clients, err := s.ListClients(ctx, &sourcegraph.DefsListClientsOp{Def: defSpec, Repo: 1, CommitID: "c"})
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range clients.DefClients {
		c.AvatarURL = ""
	}
	if !reflect.DeepEqual(clients.DefClients, want) {
		t.Errorf("got %+v, want %+v", clients.DefClients, want)
	}
}
