package localstore

import (
	"math"
	"reflect"
	"testing"

	"golang.org/x/net/context"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store/mockstore"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/vcs"
	sgtest "sourcegraph.com/sourcegraph/sourcegraph/pkg/vcs/testing"
	"sourcegraph.com/sourcegraph/srclib/graph"
	"sourcegraph.com/sourcegraph/srclib/unit"
)

func TestGlobalDefs(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	t.Parallel()

	var g globalDefs
	ctx, mocks, done := testContext()
	defer done()
	ctx = store.WithRepos(ctx, &repos{})

	repos := (&repos{}).mustCreate(ctx, t, &sourcegraph.Repo{URI: "a/b"})

	testDefs1 := []*graph.Def{
		{DefKey: graph.DefKey{Repo: "a/b", CommitID: "aaaa", Unit: "a/b/u", UnitType: "GoPackage", Path: "abc"}, Name: "ABC", Kind: "func", File: "a.go"},
		{DefKey: graph.DefKey{Repo: "a/b", CommitID: "aaaa", Unit: "a/b/u", UnitType: "GoPackage", Path: "xyz/abc"}, Name: "ABC", Kind: "field", File: "a.go"},
		{DefKey: graph.DefKey{Repo: "a/b", CommitID: "aaaa", Unit: "a/b/u", UnitType: "GoPackage", Path: "pqr"}, Name: "PQR", Kind: "field", File: "b.go"},
	}

	mockstore.GraphMockDefs(&mocks.Stores.Graph, testDefs1...)
	mockstore.GraphMockUnits(&mocks.Stores.Graph, &unit.SourceUnit{Key: unit.Key{Name: "a/b/u", Type: "t"}})
	mocks.Repos.GetByURI_ = func(ctx context.Context, repo string) (*sourcegraph.Repo, error) {
		return &sourcegraph.Repo{}, nil
	}
	mocks.RepoVCS.Open_ = func(ctx context.Context, repo int32) (vcs.Repository, error) {
		return sgtest.MockRepository{
			ResolveRevision_: func(spec string) (vcs.CommitID, error) {
				return "aaaa", nil
			},
		}, nil
	}
	op := store.GlobalDefUpdateOp{RepoUnits: []store.RepoUnit{{Repo: repos[0].ID}}}
	err := g.Update(ctx, op)
	if err != nil {
		t.Fatal(err)
	}
	err = g.RefreshRefCounts(ctx, op)
	if err != nil {
		t.Fatal(err)
	}

	testCases := []struct {
		Query   []string
		Results []*sourcegraph.DefSearchResult
	}{
		{
			[]string{"abc"},
			[]*sourcegraph.DefSearchResult{
				{Def: sourcegraph.Def{Def: *testDefs1[1]}},
				{Def: sourcegraph.Def{Def: *testDefs1[0]}},
			},
		},
		{
			[]string{"pqr"},
			[]*sourcegraph.DefSearchResult{
				{Def: sourcegraph.Def{Def: *testDefs1[2]}},
			},
		},
	}
	for _, test := range testCases {
		got, err := g.Search(ctx, &store.GlobalDefSearchOp{TokQuery: test.Query})
		if err != nil {
			t.Fatal(err)
		}

		if got == nil {
			t.Errorf("got nil result from GlobalDefs.Search")
			continue
		}

		// strip score
		for _, res := range got.DefResults {
			res.Score = 0
		}

		if !verifyResultsMatch(got.DefResults, test.Results) {
			t.Errorf("got %+v, want %+v", got.DefResults, test.Results)
		}
	}
}

func TestGlobalDefs_PrefixMatch(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	t.Parallel()

	var g globalDefs
	ctx, mocks, done := testContext()
	defer done()

	testDefs1 := []*graph.Def{
		{DefKey: graph.DefKey{Repo: "a/b", CommitID: "aaaa", Unit: "a/b/u", UnitType: "GoPackage", Path: "abc"}, Name: "ABC", Kind: "func", File: "a.go"},
		{DefKey: graph.DefKey{Repo: "a/b", CommitID: "aaaa", Unit: "a/b/u", UnitType: "GoPackage", Path: "xyz/abc"}, Name: "ABC", Kind: "field", File: "a.go"},
	}

	mockstore.GraphMockDefs(&mocks.Stores.Graph, testDefs1...)
	mockstore.GraphMockUnits(&mocks.Stores.Graph, &unit.SourceUnit{Key: unit.Key{Name: "a/b/u", Type: "t"}})
	mocks.Repos.Get_ = func(ctx context.Context, repo int32) (*sourcegraph.Repo, error) {
		return &sourcegraph.Repo{ID: 1, URI: "a/b"}, nil
	}
	mocks.RepoVCS.Open_ = func(ctx context.Context, repo int32) (vcs.Repository, error) {
		return sgtest.MockRepository{
			ResolveRevision_: func(spec string) (vcs.CommitID, error) {
				return "aaaa", nil
			},
		}, nil
	}
	op := store.GlobalDefUpdateOp{RepoUnits: []store.RepoUnit{{Repo: 1}}}
	err := g.Update(ctx, op)
	if err != nil {
		t.Fatal(err)
	}
	err = g.RefreshRefCounts(ctx, op)
	if err != nil {
		t.Fatal(err)
	}

	testCases := []struct {
		Query   []string
		Results []*sourcegraph.DefSearchResult
	}{
		{
			[]string{"ab"},
			nil,
		},
		{
			[]string{"abc"},
			[]*sourcegraph.DefSearchResult{
				{Def: sourcegraph.Def{Def: *testDefs1[0]}},
				{Def: sourcegraph.Def{Def: *testDefs1[1]}},
			},
		},
		{
			[]string{"xyz", "abc"},
			[]*sourcegraph.DefSearchResult{
				{Def: sourcegraph.Def{Def: *testDefs1[1]}},
			},
		},
	}
	for _, test := range testCases {
		got, err := g.Search(ctx, &store.GlobalDefSearchOp{
			TokQuery: test.Query,
			Opt: &sourcegraph.SearchOptions{
				PrefixMatch: true,
			},
		})
		if err != nil {
			t.Fatal(err)
		}

		if got == nil {
			t.Errorf("got nil result from GlobalDefs.Search")
			continue
		}

		// strip score
		for _, res := range got.DefResults {
			res.Score = 0
		}

		if !verifyResultsMatch(got.DefResults, test.Results) {
			t.Errorf("got %+v, want %+v", got.DefResults, test.Results)
		}
	}
}

func verifyResultsMatch(got, want []*sourcegraph.DefSearchResult) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if !reflect.DeepEqual(got[i].Def, want[i].Def) {
			return false
		}
		if got[i].RefCount != want[i].RefCount {
			return false
		}
		if math.Abs(float64(got[i].Score-want[i].Score)) >= 0.0001 {
			return false
		}
	}
	return true
}
