// generated by gen-mocks; DO NOT EDIT

package mockstore

import (
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store"
)

type Queue struct {
	Enqueue_ func(ctx context.Context, j *store.Job) error
	LockJob_ func(ctx context.Context) (*store.LockedJob, error)
	Stats_   func(ctx context.Context) (map[string]store.QueueStats, error)
}

func (s *Queue) Enqueue(ctx context.Context, j *store.Job) error { return s.Enqueue_(ctx, j) }

func (s *Queue) LockJob(ctx context.Context) (*store.LockedJob, error) { return s.LockJob_(ctx) }

func (s *Queue) Stats(ctx context.Context) (map[string]store.QueueStats, error) { return s.Stats_(ctx) }

var _ store.Queue = (*Queue)(nil)
