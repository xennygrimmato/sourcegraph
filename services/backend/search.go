package backend

import (
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"gopkg.in/inconshreveable/log15.v2"

	"sourcegraph.com/sourcegraph/sourcegraph/services/svc"
	"sourcegraph.com/sourcegraph/srclib/graph"

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
	observe := func(part string, start time.Time) {
		d := time.Since(start)
		log15.Debug("TRACE search", "query", op.Query, "part", part, "duration", d)
		searchDuration.WithLabelValues(part).Observe(float64(d.Seconds()))
	}
	defer observe("total", time.Now())

	start := time.Now()
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
			descToks = append(descToks, queryTokens(token)...)
		}
	}
	observe("tokenize", start)

	start = time.Now()
	results, err := store.DefsFromContext(ctx).Search(ctx, store.DefSearchOp{
		TokQuery: descToks,
		Opt:      op.Opt,
	})
	if err != nil {
		return nil, err
	}
	observe("defs", start)

	start = time.Now()
	hydratedDefResults, err := hydrateDefsResults(ctx, results.DefResults)
	if err != nil {
		return nil, err
	}
	results.DefResults = hydratedDefResults
	observe("hydrate", start)

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

	defer observe("repos", time.Now())
	results.RepoResults, err = store.ReposFromContext(ctx).Search(ctx, op.Query)
	if err != nil {
		return nil, err
	}
	return results, nil
}

var delims = regexp.MustCompile(`[/.:\$\(\)\*\%\#\@\[\]\{\}]+`)

// strippedQuery is the user query after it has been stripped of special filter terms
func queryTokens(strippedQuery string) []string {
	prototoks := delims.Split(strippedQuery, -1)
	if len(prototoks) == 0 {
		return nil
	}
	toks := make([]string, 0, len(prototoks))
	for _, tokmaybe := range prototoks {
		if tokmaybe != "" {
			toks = append(toks, tokmaybe)
		}
	}
	return toks
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

	// fetch definition metadata in parallel
	var (
		deflist []*sourcegraph.Def
		mu      sync.Mutex
		wg      sync.WaitGroup
		errs    []error
	)
	wg.Add(len(defkeys))
	for _, dk := range defkeys {
		dk := dk
		go func() {
			defer wg.Done()

			rp, err := store.ReposFromContext(ctx).GetByURI(ctx, dk.Repo)
			if err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
				return
			}
			df, err := svc.Defs(ctx).Get(ctx, &sourcegraph.DefsGetOp{
				Def: sourcegraph.DefSpec{
					Repo:     rp.ID,
					CommitID: dk.CommitID,
					UnitType: dk.UnitType,
					Unit:     dk.Unit,
					Path:     dk.Path,
				},
				Opt: &sourcegraph.DefGetOptions{Doc: true},
			})
			if err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
				return
			}
			{
				mu.Lock()
				deflist = append(deflist, df)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if errs != nil {
		return nil, fmt.Errorf("fetching definition metadata failed with errors: %+v", errs)
	}

	hydratedDefs := make(map[graph.DefKey]*sourcegraph.Def)
	for _, def := range deflist {
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

var searchDuration = prometheus.NewSummaryVec(prometheus.SummaryOpts{
	Namespace: "src",
	Subsystem: "search",
	Name:      "duration_seconds",
	Help:      "Duration of Search.Search queries",
	MaxAge:    time.Hour,
}, []string{"part"})

func init() {
	prometheus.MustRegister(searchDuration)
}
