package backend_test

import (
	"testing"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/testutil"
	"sourcegraph.com/sourcegraph/sourcegraph/services/backend/testserver"
)

func TestDeltas_lg(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	t.Parallel()

	a, ctx := testserver.NewUnstartedServer()
	if err := a.Start(); err != nil {
		t.Fatal(err)
	}
	defer a.Close()

	repo, commitID, done, err := testutil.CreateAndPushRepo(t, ctx, "myrepo")
	if err != nil {
		t.Fatal(err)
	}
	defer done()

	deltaSpec := &sourcegraph.DeltaSpec{
		Base: sourcegraph.RepoRevSpec{Repo: repo.ID, CommitID: commitID},
		Head: sourcegraph.RepoRevSpec{Repo: repo.ID, CommitID: commitID},
	}
	delta, err := a.Client.Deltas.Get(ctx, deltaSpec)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := a.Client.Deltas.ListFiles(ctx, &sourcegraph.DeltasListFilesOp{Ds: delta.DeltaSpec()}); err != nil {
		t.Fatal(err)
	}
}
