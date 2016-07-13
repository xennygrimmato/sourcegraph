package localstore

import "time"
import "golang.org/x/net/context"
import "gopkg.in/inconshreveable/log15.v2"

import "database/sql"
import "errors"

import "gopkg.in/gorp.v1"
import "sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"

import "sourcegraph.com/sourcegraph/sourcegraph/pkg/store"

import "sourcegraph.com/sourcegraph/sourcegraph/pkg/dbutil"
import "sourcegraph.com/sourcegraph/sourcegraph/pkg/amortize"

type dbBlacklistedSessionToken struct {
	UID              int32     // the user whose owned this token
	Token            string    // the token
	BlacklistedUntil time.Time `db:"blacklist_util"` // the last time this token was marked invalid
}

type blacklistedSessionTokens struct{}

var _ store.BlacklistedSessionTokens = (*blacklistedSessionTokens)(nil)

func init() {
	AppSchema.Map.AddTableWithName(dbBlacklistedSessionToken{}, "blacklisted_session_token").SetKeys(false, "UID", "Token", "BlacklistedUntil")
}

func (s *blacklistedSessionTokens) PersistBlacklistedToken(ctx context.Context, user int32, token string) (r *sourcegraph.BlacklistResponse, err error) {
	if token == "" {
		return &sourcegraph.BlacklistResponse{Added: false}, errors.New("no token specified")
	}
	if user == 0 {
		return &sourcegraph.BlacklistResponse{Added: false}, nil // not an error per se, but we don't blacklist tokens if the user isn't logged in
	}

	// Fill in our row
	now := time.Now()
	// This matches the  hardcoded value set in backend/authenticatedLogin and is guaranteed to exceed
	// the actual token lifetime.
	expire := now.Add(90 * 24 * time.Hour)

	tok := &dbBlacklistedSessionToken{UID: user, Token: token, BlacklistedUntil: expire}

	dberr := dbutil.Transact(appDBH(ctx), func(tx gorp.SqlExecutor) error {
		// And add it to the database
		return tx.Insert(tok)
	})
	if dberr != nil {
		return &sourcegraph.BlacklistResponse{Added: false}, dberr
	}
	return &sourcegraph.BlacklistResponse{Added: true}, nil
}

func (s *blacklistedSessionTokens) CheckSessionTokenBlacklist(ctx context.Context, user int32, token string) (r *sourcegraph.BlacklistCheckResponse, err error) {

	//Before we perform the check, let's see if we're luck enough to run the prune job, 1/100000 is just a guess as to how often
	//this should run
	if amortize.ShouldAmortize(1, 100000) {
		removed, err := s.cleanOldTokens(ctx)
		if err != nil {
			log15.Error("Prune of blacklist table failed", "error", err)
		} else {
			log15.Debug("Prune of blacklist succeed without error", "removed", removed)
		}
	}

	var blacklisted dbBlacklistedSessionToken
	err = appDBH(ctx).SelectOne(&blacklisted, `SELECT * FROM blacklisted_session_token WHERE UID=$1 AND token=$2 LIMIT 1;`, user, token)
	if err == sql.ErrNoRows {
		return &sourcegraph.BlacklistCheckResponse{Ok: true}, nil
	} else if err != nil {
		return &sourcegraph.BlacklistCheckResponse{Ok: false}, err
	}
	return &sourcegraph.BlacklistCheckResponse{Ok: false}, nil
}

func (s *blacklistedSessionTokens) cleanOldTokens(ctx context.Context) (removed int32, err error) {
	now := time.Now()
	dbresp, err := appDBH(ctx).Exec(`DELETE FROM blacklisted_session_token WHERE blacklist_until > $1;`, now)
	if err != nil {
		return 0, err
	}
	rows, err := dbresp.RowsAffected()
	return int32(rows), err

}
