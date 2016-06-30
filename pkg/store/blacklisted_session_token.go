package store

import (
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
)

type BlacklistedSessionTokens interface {
	PersistBlacklistedToken(ctx context.Context, user int32, token string) (r *sourcegraph.BlacklistResponse, err error)
	CheckSessionTokenBlacklist(ctx context.Context, user int32, token string) (r *sourcegraph.BlacklistCheckResponse, err error)
}
