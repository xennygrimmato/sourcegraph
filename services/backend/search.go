package backend

import (
	"fmt"
	"strings"

	"gopkg.in/inconshreveable/log15.v2"

	srch "sourcegraph.com/sourcegraph/sourcegraph/pkg/search"
	"sourcegraph.com/sourcegraph/sourcegraph/services/svc"
	"sourcegraph.com/sourcegraph/srclib/graph"
	"sourcegraph.com/sqs/pbtypes"

	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store"
)

var Search sourcegraph.SearchServer = &search{}

type search struct{}

var _ sourcegraph.SearchServer = (*search)(nil)

var tokenToKind = map[string]string{
	"func":    "func",
	"method":  "func",
	"type":    "type",
	"struct":  "type",
	"class":   "type",
	"var":     "var",
	"field":   "field",
	"package": "package",
	"pkg":     "package",
	"const":   "const",
}

var tokenToLanguage = map[string]string{
	"golang": "go",
	"java":   "java",
	"python": "python",
}

func (s *search) Search(ctx context.Context, op *sourcegraph.SearchOp) (*sourcegraph.SearchResultsList, error) {
	var kinds []string
	var descToks []string                            // "descriptor" tokens that don't have a special filter meaning.
	for _, token := range strings.Fields(op.Query) { // at first tokenize on spaces
		if strings.HasPrefix(token, "r:") {
			repoPath := strings.TrimPrefix(token, "r:")
			res, err := svc.Repos(ctx).Resolve(ctx, &sourcegraph.RepoResolveOp{Path: repoPath})
			if err == nil {
				op.Opt.Repos = append(op.Opt.Repos, res.Repo)
			} else {
				log15.Warn("Search.Search: failed to resolve repo in query; ignoring.", "repo", repoPath, "err", err)
			}
			continue
		}
		if kind, exist := tokenToKind[strings.ToLower(token)]; exist {
			op.Opt.Kinds = append(op.Opt.Kinds, kind)
			continue
		}
		if lang, exist := tokenToLanguage[strings.ToLower(token)]; exist {
			op.Opt.Languages = append(op.Opt.Languages, lang)
			continue
		}

		// function shorthand, still include token as a descriptor token
		if strings.HasSuffix(token, "()") {
			kinds = append(kinds, "func")
		}

		if strings.HasSuffix(token, ".com") || strings.HasSuffix(token, ".org") {
			descToks = append(descToks, token)
		} else {
			descToks = append(descToks, srch.QueryTokens(token)...)
		}
	}

	var (
		results *sourcegraph.SearchResultsList
		err     error
	)
	if op.Opt.CommitID != "" {
		opt := *op.Opt
		opt.Latest = true
		results, err = store.DefsFromContext(ctx).Search(ctx, store.DefSearchOp{
			TokQuery: descToks,
			Opt:      &opt,
		})
	} else {
		results, err = store.GlobalDefsFromContext(ctx).Search(ctx, &store.GlobalDefSearchOp{
			TokQuery: descToks,
			Opt:      op.Opt,
		})
	}
	if err != nil {
		return nil, err
	}

	hydratedDefResults, err := hydrateDefsResults(ctx, results.DefResults)
	if err != nil {
		return nil, err
	}
	results.DefResults = hydratedDefResults

	// For global search analytics purposes
	results.SearchQueryOptions = []*sourcegraph.SearchOptions{op.Opt}

	if err != nil {
		return nil, err
	}

	for _, r := range results.DefResults {
		populateDefFormatStrings(&r.Def)
	}

	if !op.Opt.IncludeRepos {
		return results, nil
	}

	results.RepoResults, err = store.ReposFromContext(ctx).Search(ctx, op.Query)
	if err != nil {
		return nil, err
	}
	return results, nil
}

func hydrateDefsResults(ctx context.Context, defs []*sourcegraph.DefSearchResult) ([]*sourcegraph.DefSearchResult, error) {
	if len(defs) == 0 {
		return defs, nil
	}

	reporevs_ := make(map[string]struct{})
	defkeys_ := make(map[graph.DefKey]struct{})
	for _, def := range defs {
		reporevs_[fmt.Sprintf("%s@%s", def.Def.DefKey.Repo, def.Def.DefKey.CommitID)] = struct{}{}
		defkeys_[def.Def.DefKey] = struct{}{}
	}
	reporevs := make([]string, 0, len(reporevs_))
	for rr := range reporevs_ {
		reporevs = append(reporevs, rr)
	}
	defkeys := make([]*graph.DefKey, 0, len(defkeys_))
	for dk := range defkeys_ {
		dk_ := dk
		defkeys = append(defkeys, &dk_)
	}
	deflist, err := svc.Defs(ctx).List(ctx, &sourcegraph.DefListOptions{
		DefKeys:  defkeys,
		RepoRevs: reporevs,
	})
	if err != nil {
		return nil, err
	}

	hydratedDefs := make(map[graph.DefKey]*sourcegraph.Def)
	for _, def := range deflist.Defs {
		hydratedDefs[def.DefKey] = def
	}
	hydratedResults := make([]*sourcegraph.DefSearchResult, 0, len(defs))
	for _, defResult := range defs {
		if d, exist := hydratedDefs[defResult.Def.DefKey]; exist {
			defResult.Def = *d
			hydratedResults = append(hydratedResults, defResult)
		} else {
			log15.Warn("did not find def in graph store, excluding from search results", "def", defResult)
		}
	}
	return hydratedResults, nil
}

func (s *search) RefreshIndex(ctx context.Context, op *sourcegraph.SearchRefreshIndexOp) (*pbtypes.Void, error) {
	// Currently, the only pre-computation we do is aggregating the global ref counts
	// for every def. This will pre-compute the ref counts based on the current state
	// of the GlobalRefs table for all defs in the given repos.
	var updateOp store.GlobalDefUpdateOp
	for _, repo := range op.Repos {
		updateOp.RepoUnits = append(updateOp.RepoUnits, store.RepoUnit{Repo: repo})
	}

	if op.RefreshSearch {
		if err := store.GlobalDefsFromContext(ctx).Update(ctx, updateOp); err != nil {
			return nil, err
		}
	}

	if op.RefreshCounts {
		if err := store.GlobalDefsFromContext(ctx).RefreshRefCounts(ctx, updateOp); err != nil {
			return nil, err
		}
	}

	return &pbtypes.Void{}, nil
}
