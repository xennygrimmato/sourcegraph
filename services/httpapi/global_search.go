package httpapi

import (
	"encoding/json"
	"net/http"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/handlerutil"
)

type RepoSearchResult struct {
	*sourcegraph.Repo
}

type DefSearchResult struct {
	sourcegraph.Def
	RefCount int32
	Score    float32
}

type SearchOptions struct {
	Kinds     []string
	Languages []string
}

func serveGlobalSearch(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	var params struct {
		Query        string
		Repos        []string
		NotRepos     []string
		Limit        int32
		PrefixMatch  bool
		IncludeRepos bool
	}
	if err := schemaDecoder.Decode(&params, r.URL.Query()); err != nil {
		return err
	}

	if params.Limit == 0 {
		params.Limit = 100
	}

	paramsRepos, err := resolveLocalRepos(ctx, params.Repos)
	if err != nil {
		return err
	}
	paramsNotRepos, err := resolveLocalRepos(ctx, params.NotRepos)
	if err != nil {
		return err
	}

	op := &sourcegraph.SearchOp{
		Query: params.Query,
		Opt: &sourcegraph.SearchOptions{
			Repos:        paramsRepos,
			NotRepos:     paramsNotRepos,
			ListOptions:  sourcegraph.ListOptions{PerPage: params.Limit},
			PrefixMatch:  params.PrefixMatch,
			IncludeRepos: params.IncludeRepos,
		},
	}

	results, err := cl.Search.Search(ctx, op)
	if err != nil {
		return err
	}
	repos := make([]*RepoSearchResult, 0, len(results.RepoResults))
	for _, r := range results.RepoResults {
		repos = append(repos, &RepoSearchResult{
			Repo: r.Repo,
		})
	}

	var defs []*DefSearchResult
	for _, r := range results.DefResults {
		r.Def.CommitID = "master" // HACK
		defs = append(defs, &DefSearchResult{
			Def:      r.Def,
			RefCount: r.RefCount,
			Score:    r.Score,
		})
	}

	var options []*SearchOptions
	for _, r := range results.SearchQueryOptions {
		options = append(options, &SearchOptions{
			Kinds:     r.Kinds,
			Languages: r.Languages,
		})
	}

	return json.NewEncoder(w).Encode(struct {
		Repos   []*RepoSearchResult
		Defs    []*DefSearchResult
		Options []*SearchOptions
	}{
		Repos:   repos,
		Defs:    defs,
		Options: options,
	})
}
