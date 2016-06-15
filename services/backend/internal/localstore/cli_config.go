package localstore

import (
	"log"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store"
	"sourcegraph.com/sourcegraph/sourcegraph/services/backend/internal/localstore/middleware"
	"sourcegraph.com/sourcegraph/sourcegraph/services/backend/serverctx"
)

func init() {
	stores := store.Stores{
		Accounts:           &accounts{},
		BuildLogs:          &buildLogs{},
		Builds:             &builds{},
		Channel:            &channel{},
		DefExamples:        &examples{},
		Directory:          &directory{},
		ExternalAuthTokens: &externalAuthTokens{},
		GlobalDefs:         &globalDefs{},
		GlobalDeps:         &globalDeps{},
		GlobalRefs:         &globalRefs{},
		Password:           &password{},
		Queue:              &middleware.InstrumentedQueue{Queue: &queue{}},
		RepoConfigs:        &repoConfigs{},
		RepoStatuses:       &repoStatuses{},
		RepoVCS:            &repoVCS{},
		Repos:              &repos{},
		Users:              &users{},
	}

	once := sync.Once{}
	serverctx.Funcs = append(serverctx.Funcs, func(ctx context.Context) (context.Context, error) {
		// initBackground inside of serverctx.Funcs to ensure cli
		// options have already been set.
		once.Do(func() {
			err := initBackground(stores)
			if err != nil {
				log.Fatal(err)
			}
		})
		return store.WithStores(ctx, stores), nil
	})

}

// initBackground starts up background store helpers
func initBackground(stores store.Stores) error {
	// Currently the only thing we need in a background helper is the
	// AppDBH
	appDBH, _, err := globalDBs()
	if err != nil {
		return err
	}
	ctx := WithAppDBH(context.Background(), appDBH)

	c := middleware.NewQueueStatsCollector(ctx, stores.Queue)
	prometheus.MustRegister(c)

	return nil
}
