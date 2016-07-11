package repoupdater

import (
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"golang.org/x/net/context"
	"gopkg.in/inconshreveable/log15.v2"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/app/appconf"
)

const (
	repoUpdaterQueueDepth = 10
)

var (
	enqueueCounter = prometheus.NewCounter(prometheus.CounterOpts{
		Namespace: "src",
		Subsystem: "repoupdater",
		Name:      "enqueue",
		Help:      "Number of requests to enqueue repos (but not necessarily accepted into queue)",
	})
	acceptedCounter = prometheus.NewCounter(prometheus.CounterOpts{
		Namespace: "src",
		Subsystem: "repoupdater",
		Name:      "enqueue_accepted",
		Help:      "Number of requests to enqueue repos that were accepted / added to queue",
	})
)

func init() {
	prometheus.MustRegister(enqueueCounter)
	prometheus.MustRegister(acceptedCounter)
}

// Enqueue queues a mirror repo for refresh. If asUser is not nil, that user's
// auth token will be used for performing the fetch from the remote host.
func Enqueue(repo int32, asUser *sourcegraph.UserSpec) {
	enqueueCounter.Inc()
	RepoUpdater.enqueue(&repoUpdateOp{Repo: repo, AsUser: asUser})
}

// RepoUpdater is the app repo updater worker. Repo update requests can be enqueued, with debouncing taken care of.
var RepoUpdater = &repoUpdater{
	recent: make(map[int32]time.Time),
	queue:  make(chan *repoUpdateOp, repoUpdaterQueueDepth),
}

type repoUpdateOp struct {
	Repo   int32
	AsUser *sourcegraph.UserSpec
}

type repoUpdater struct {
	mu     sync.Mutex
	recent map[int32]time.Time // Map of recently scheduled repo updates. Key is repo ID, value is last updated time.

	queue chan *repoUpdateOp // Queue of scheduled repo updates.
}

// Start one background repo updater worker with the given context.
func (ru *repoUpdater) Start(ctx context.Context) {
	go ru.run(ctx)
}

// enqueue the given repo to be updated.
//
// If the same repo spec has been recently enqueued (within MirrorUpdateRate), it is ignored.
// If the backlog for repos to be updated is too large (reaches repoUpdaterQueueDepth), it is also ignored.
func (ru *repoUpdater) enqueue(op *repoUpdateOp) {
	ru.mu.Lock()
	defer ru.mu.Unlock()

	now := time.Now()

	// Clear repos that were updated long ago from recent map.
	for rs, lastUpdated := range ru.recent {
		if lastUpdated.Before(now.Add(-appconf.Flags.MirrorRepoUpdateRate)) {
			delete(ru.recent, rs)
		}
	}

	// Skip if recently updated.
	if _, recent := ru.recent[op.Repo]; recent {
		return
	}

	select {
	case ru.queue <- op:
		acceptedCounter.Inc()
		ru.recent[op.Repo] = now
	default:
		// Skip since queue is full.
	}
}

func (ru *repoUpdater) run(ctx context.Context) {
	cl, err := sourcegraph.NewClientFromContext(ctx)
	if err != nil {
		log15.Error("repoUpdater: RefreshVCS: could not create client", "error", err)
		return
	}

	for updateOp := range ru.queue {
		op := &sourcegraph.MirrorReposRefreshVCSOp{
			Repo:   updateOp.Repo,
			AsUser: updateOp.AsUser,
		}

		if updateOp.AsUser != nil {
			log15.Debug("repoUpdater: RefreshVCS:", "repo", updateOp.Repo, "asUser", updateOp.AsUser.Login)
		} else {
			log15.Debug("repoUpdater: RefreshVCS:", "repo", updateOp.Repo)
		}
		if _, err := cl.MirrorRepos.RefreshVCS(ctx, op); err != nil {
			log15.Warn("repoUpdater: RefreshVCS:", "error", err)
			continue
		}
	}
}
