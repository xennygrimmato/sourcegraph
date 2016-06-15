package httpapi

import (
	"net/http"

	"github.com/gorilla/mux"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/handlerutil"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/routevar"
	"sourcegraph.com/sourcegraph/sourcegraph/services/repoupdater"
	"sourcegraph.com/sqs/pbtypes"
)

func serveRepoResolveRev(w http.ResponseWriter, r *http.Request) error {
	ctx, _ := handlerutil.Client(r)

	repoRev := routevar.ToRepoRev(mux.Vars(r))
	res, err := resolveLocalRepoRev(ctx, repoRev)
	if err != nil {
		return err
	}

	var cacheControl string
	if len(repoRev.Rev) == 40 {
		cacheControl = "private, max-age=600"
	} else {
		cacheControl = "private, max-age=15"
	}
	w.Header().Set("cache-control", cacheControl)
	return writeJSON(w, res)
}

func serveCommit(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	rawRepoRev := routevar.ToRepoRev(mux.Vars(r))
	abs := len(rawRepoRev.Rev) == 40 // absolute commit ID?

	repoRev, err := resolveLocalRepoRev(ctx, rawRepoRev)
	if err != nil {
		return err
	}
	commit, err := cl.Repos.GetCommit(ctx, repoRev)
	if err != nil {
		return err
	}

	var cacheControl string
	if abs {
		cacheControl = "private, max-age=3600"
	} else {
		cacheControl = "private, max-age=15"
	}
	w.Header().Set("cache-control", cacheControl)
	return writeJSON(w, commit)
}

func serveRepoCommits(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	repoID, err := resolveLocalRepo(ctx, routevar.ToRepo(mux.Vars(r)))
	if err != nil {
		return err
	}

	var opt sourcegraph.RepoListCommitsOptions
	if err := schemaDecoder.Decode(&opt, r.URL.Query()); err != nil {
		return err
	}

	commits, err := cl.Repos.ListCommits(ctx, &sourcegraph.ReposListCommitsOp{Repo: repoID, Opt: &opt})
	if err != nil {
		return err
	}

	var cacheControl string
	if len(opt.Head) == 40 && (len(opt.Base) == 0 || len(opt.Base) == 40) {
		cacheControl = "private, max-age=600"
	} else {
		cacheControl = "private, max-age=15"
	}
	w.Header().Set("cache-control", cacheControl)
	return writeJSON(w, commits)
}

func serveRepoRefresh(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	var opt sourcegraph.MirrorReposRefreshVCSOp
	err := schemaDecoder.Decode(&opt, r.URL.Query())
	if err != nil {
		return err
	}

	repo, err := handlerutil.GetRepoID(ctx, mux.Vars(r))
	if err != nil {
		return err
	}

	authInfo, err := cl.Auth.Identify(ctx, &pbtypes.Void{})
	if err != nil {
		return err
	}

	repoupdater.Enqueue(repo, authInfo.UserSpec())
	w.WriteHeader(http.StatusAccepted)
	return nil
}

func serveRepoBranches(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	var opt sourcegraph.RepoListBranchesOptions
	err := schemaDecoder.Decode(&opt, r.URL.Query())
	if err != nil {
		return err
	}

	repo, err := handlerutil.GetRepoID(ctx, mux.Vars(r))
	if err != nil {
		return err
	}

	branches, err := cl.Repos.ListBranches(ctx, &sourcegraph.ReposListBranchesOp{Repo: repo, Opt: &opt})
	if err != nil {
		return err
	}
	return writeJSON(w, branches)
}

func serveRepoTags(w http.ResponseWriter, r *http.Request) error {
	ctx, cl := handlerutil.Client(r)

	var opt sourcegraph.RepoListTagsOptions
	err := schemaDecoder.Decode(&opt, r.URL.Query())
	if err != nil {
		return err
	}

	repo, err := handlerutil.GetRepoID(ctx, mux.Vars(r))
	if err != nil {
		return err
	}

	tags, err := cl.Repos.ListTags(ctx, &sourcegraph.ReposListTagsOp{Repo: repo, Opt: &opt})
	if err != nil {
		return err
	}
	return writeJSON(w, tags)
}
