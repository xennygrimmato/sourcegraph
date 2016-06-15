package github

import (
	"errors"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"gopkg.in/inconshreveable/log15.v2"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/sourcegraph/go-github/github"
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/conf"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/githubutil"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/rcache"
	"sourcegraph.com/sqs/pbtypes"
)

var (
	reposGithubPublicCacheTTL     = conf.GetenvIntOrDefault("SG_REPOS_GITHUB_PUBLIC_CACHE_TTL_SECONDS", 600)
	reposGithubPublicCache        = rcache.New("gh_pub")
	reposGithubPublicCacheCounter = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: "src",
		Subsystem: "repos",
		Name:      "github_cache_hit",
		Help:      "Counts cache hits and misses for public github repo metadata.",
	}, []string{"type"})
)

func init() {
	prometheus.MustRegister(reposGithubPublicCacheCounter)
}

type Repos struct{}

type cachedRemoteRepo struct {
	sourcegraph.RemoteRepo

	// PublicNotFound indicates that the GitHub API returned a 404 when
	// using an Unauthed request (repo may be exist privately).
	PublicNotFound bool
}

func (s *Repos) Get(ctx context.Context, repo string) (*sourcegraph.RemoteRepo, error) {
	// This function is called a lot, especially on popular public
	// repos. For public repos we have the same result for everyone, so it
	// is cacheable. (Permissions can change, but we no longer store that.) But
	// for the purpose of avoiding rate limits, we set all public repos to
	// read-only permissions.
	//
	// First parse the repo url before even trying (redis) cache, since this can
	// invalide the request more quickly and cheaply.
	owner, repoName, err := githubutil.SplitRepoURI(repo)
	if err != nil {
		reposGithubPublicCacheCounter.WithLabelValues("local-error").Inc()
		return nil, grpc.Errorf(codes.NotFound, "github repo not found: %s", repo)
	}

	if cached, err := getFromCache(ctx, repo); err == nil {
		reposGithubPublicCacheCounter.WithLabelValues("hit").Inc()
		if cached.PublicNotFound {
			return nil, grpc.Errorf(codes.NotFound, "github repo not found: %s", repo)
		}
		return &cached.RemoteRepo, nil
	}

	remoteRepo, err := getFromAPI(ctx, owner, repoName)
	if grpc.Code(err) == codes.NotFound {
		// Before we do anything, ensure we cache NotFound responses.
		// Do this if client is unauthed or authed, it's okay since we're only caching not found responses here.
		_ = reposGithubPublicCache.Add(repo, cachedRemoteRepo{PublicNotFound: true}, reposGithubPublicCacheTTL)
		reposGithubPublicCacheCounter.WithLabelValues("public-notfound").Inc()
	}
	if err != nil {
		reposGithubPublicCacheCounter.WithLabelValues("error").Inc()
		return nil, err
	}

	// We are allowed to cache public repos
	if !remoteRepo.Private {
		_ = reposGithubPublicCache.Add(repo, remoteRepo, reposGithubPublicCacheTTL)
		reposGithubPublicCacheCounter.WithLabelValues("miss").Inc()
	} else {
		reposGithubPublicCacheCounter.WithLabelValues("private").Inc()
	}
	return remoteRepo, nil
}

func (s *Repos) GetByID(ctx context.Context, id int) (*sourcegraph.RemoteRepo, error) {
	ghrepo, resp, err := client(ctx).repos.GetByID(id)
	if err != nil {
		return nil, checkResponse(ctx, resp, err, fmt.Sprintf("github.Repos.GetByID #%d", id))
	}
	return toRemoteRepo(ghrepo), nil
}

var errInapplicableCache = errors.New("cached value cannot be used in this scenario")

// getFromCache attempts to get a response from the redis cache.
// It returns nil error for cache-hit condition and non-nil error for cache-miss.
func getFromCache(ctx context.Context, repo string) (*cachedRemoteRepo, error) {
	var cached cachedRemoteRepo
	err := reposGithubPublicCache.Get(repo, &cached)
	if err != nil {
		if err != rcache.ErrNotFound {
			log15.Error("github cache-get error", "repo", repo, "err", err)
		}
		return nil, err
	}

	// Do not use a cached NotFound if we are an authed user, since it may
	// exist as a private repo for the user.
	if client(ctx).isAuthedUser && cached.PublicNotFound {
		return nil, errInapplicableCache
	}

	return &cached, nil
}

// getFromAPI attempts to get a response from the GitHub API without use of
// the redis cache.
func getFromAPI(ctx context.Context, owner, repoName string) (*sourcegraph.RemoteRepo, error) {
	ghrepo, resp, err := client(ctx).repos.Get(owner, repoName)
	if err != nil {
		return nil, checkResponse(ctx, resp, err, fmt.Sprintf("github.Repos.Get %q", githubutil.RepoURI(owner, repoName)))
	}
	return toRemoteRepo(ghrepo), nil
}

func toRemoteRepo(ghrepo *github.Repository) *sourcegraph.RemoteRepo {
	strv := func(s *string) string {
		if s == nil {
			return ""
		}
		return *s
	}
	boolv := func(b *bool) bool {
		if b == nil {
			return false
		}
		return *b
	}
	repo := sourcegraph.RemoteRepo{
		GitHubID:      int32(*ghrepo.ID),
		Name:          *ghrepo.Name,
		VCS:           "git",
		HTTPCloneURL:  strv(ghrepo.CloneURL),
		DefaultBranch: strv(ghrepo.DefaultBranch),
		Description:   strv(ghrepo.Description),
		Language:      strv(ghrepo.Language),
		Private:       boolv(ghrepo.Private),
		Fork:          boolv(ghrepo.Fork),
		Mirror:        ghrepo.MirrorURL != nil,
	}
	if ghrepo.Owner != nil {
		repo.Owner = strv(ghrepo.Owner.Login)
		repo.OwnerIsOrg = strv(ghrepo.Owner.Type) == "Organization"
	}
	if ghrepo.UpdatedAt != nil {
		ts := pbtypes.NewTimestamp(ghrepo.UpdatedAt.Time)
		repo.UpdatedAt = &ts
	}
	if ghrepo.PushedAt != nil {
		ts := pbtypes.NewTimestamp(ghrepo.PushedAt.Time)
		repo.PushedAt = &ts
	}
	if ghrepo.WatchersCount != nil {
		repo.Stars = int32(*ghrepo.WatchersCount)
	}
	return &repo
}

// ListAccessible lists repos that are accessible to the authenticated
// user.
//
// See https://developer.github.com/v3/repos/#list-your-repositories
// for more information.
func (s *Repos) ListAccessible(ctx context.Context, opt *github.RepositoryListOptions) ([]*sourcegraph.RemoteRepo, error) {
	ghRepos, resp, err := client(ctx).repos.List("", opt)
	if err != nil {
		return nil, checkResponse(ctx, resp, err, "github.Repos.ListAccessible")
	}

	var repos []*sourcegraph.RemoteRepo
	for _, ghRepo := range ghRepos {
		repos = append(repos, toRemoteRepo(&ghRepo))
	}
	return repos, nil
}
