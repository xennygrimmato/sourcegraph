package accesscontrol

import (
	"strconv"
	"strings"

	"golang.org/x/net/context"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/auth"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store"
	"sourcegraph.com/sourcegraph/sourcegraph/services/ext/github"
)

// getRepoIDAndURI performs the necessary lookups to obtain both the
// repo URI (string) and ID (int32).
func getRepoIDAndURI(ctx context.Context, repoID int32, repoURI string) (int32, string, error) {
	var repoObj *sourcegraph.Repo
	var err error
	if repoURI == "" && repoID != 0 {
		repoObj, err = store.ReposFromContext(ctx).Get(ctx, repoID)
	} else if repoID == 0 && repoURI != "" {
		repoObj, err = store.ReposFromContext(ctx).GetByURI(ctx, repoURI)
	}
	if err != nil {
		return 0, "", err
	}
	if repoObj != nil {
		if repoURI == "" {
			repoURI = repoObj.URI
		}
		if repoID == 0 {
			repoID = repoObj.ID
		}
	}
	return repoID, repoURI, nil
}

// VerifyUserHasReadAccess checks if the user in the current context
// is authorized to make write requests to this server.
//
// This method always returns nil when the user has write access,
// and returns a non-nil error when access cannot be granted.
// If the cmdline flag auth.restrict-write-access is set, this method
// will check if the authenticated user has admin privileges.
func VerifyUserHasReadAccess(ctx context.Context, method string, repoID int32, repoURI string) error {
	return VerifyActorHasReadAccess(ctx, auth.ActorFromContext(ctx), method, repoID, repoURI)
}

// VerifyUserHasWriteAccess checks if the user in the current context
// is authorized to make write requests to this server.
//
// This method always returns nil when the user has write access,
// and returns a non-nil error when access cannot be granted.
// If the cmdline flag auth.restrict-write-access is set, this method
// will check if the authenticated user has admin privileges.
func VerifyUserHasWriteAccess(ctx context.Context, method string, repoID int32, repoURI string) error {
	return VerifyActorHasWriteAccess(ctx, auth.ActorFromContext(ctx), method, repoID, repoURI)
}

// VerifyUserHasWriteAccess checks if the user in the current context
// is authorized to make admin requests to this server.
func VerifyUserHasAdminAccess(ctx context.Context, method string) error {
	return VerifyActorHasAdminAccess(ctx, auth.ActorFromContext(ctx), method)
}

// VerifyUserSelfOrAdmin checks if the user in the current context has
// the given uid, or if the actor has admin access on the server.
// This check should be used in cases where a request should succeed only
// if the request is for the user's own information, or if the ctx actor is an admin.
func VerifyUserSelfOrAdmin(ctx context.Context, method string, uid int32) error {
	if uid != 0 && auth.ActorFromContext(ctx).UID == int(uid) {
		return nil
	}

	return VerifyUserHasAdminAccess(ctx, method)
}

// VerifyClientSelfOrAdmin checks if the client in the current context has
// the given id, or if the actor has admin access on the server.
// This check should be used in cases where a request should succeed only
// if the request is for the client's own information, or if the ctx actor is an admin.
func VerifyClientSelfOrAdmin(ctx context.Context, method string, clientID string) error {
	return VerifyUserHasAdminAccess(ctx, method)
}

// VerifyActorHasReadAccess checks if the given actor is authorized to make
// read requests to this server.
//
// Note that this function allows the caller to retrieve any user's
// access levels.  This is meant for trusted server code living
// outside the scope of gRPC requests to verify user permissions. For
// all other cases, VerifyUserHasWriteAccess or
// VerifyUserHasAdminAccess should be used to authorize a user for
// gRPC operations.
func VerifyActorHasReadAccess(ctx context.Context, actor auth.Actor, method string, repoID int32, repoURI string) error {
	repoID, repoURI, err := getRepoIDAndURI(ctx, repoID, repoURI)
	if err != nil {
		return err
	}

	// TODO: move to a security model that is more robust, readable, has better separation
	// when dealing with multiple configurations, actor types, resource types and actions.
	//
	// Delegate permissions check to GitHub for GitHub mirrored repos.
	if strings.HasPrefix(strings.ToLower(repoURI), "github.com/") {
		if !VerifyScopeHasAccess(ctx, actor.Scope, method, repoID) {
			_, err := (&github.Repos{}).Get(ctx, repoURI)
			if err != nil {
				// We don't know if the error is unauthenticated or unauthorized, so return unauthenticated
				// so that git clients will try again, providing authentication information.
				// If we return codes.PermissionDenied here, then git clients won't even try to supply authentication info.
				return grpc.Errorf(codes.Unauthenticated, "read operation (%s) denied: not authenticated/authorized by GitHub API", method)
			}
		}
	}

	return nil
}

// VerifyActorHasWriteAccess checks if the given actor is authorized to make
// write requests to this server.
//
// Note that this function allows the caller to retrieve any user's
// access levels.  This is meant for trusted server code living
// outside the scope of gRPC requests to verify user permissions. For
// all other cases, VerifyUserHasWriteAccess should be used to
// authorize a user for gRPC operations.
func VerifyActorHasWriteAccess(ctx context.Context, actor auth.Actor, method string, repoID int32, repoURI string) error {
	// TODO: redesign the permissions model to avoid short-circuited "return nil"s.
	// (because it makes modifying authorization logic more error-prone.)

	repoID, repoURI, err := getRepoIDAndURI(ctx, repoID, repoURI)
	if err != nil {
		return err
	}

	if !actor.IsAuthenticated() {
		if VerifyScopeHasAccess(ctx, actor.Scope, method, repoID) {
			return nil
		}
		return grpc.Errorf(codes.Unauthenticated, "write operation (%s) denied: not authenticated", method)
	}

	var hasWrite bool
	if inAuthenticatedWriteWhitelist(method) {
		hasWrite = true
	} else {
		hasWrite = actor.HasWriteAccess()
	}

	if !hasWrite {
		return grpc.Errorf(codes.PermissionDenied, "write operation (%s) denied: user does not have write access", method)
	}

	// TODO: move to a security model that is more robust, readable, has better separation
	// when dealing with multiple configurations, actor types, resource types and actions.
	//
	// Delegate permissions check to GitHub for GitHub mirrored repos.
	if strings.HasPrefix(strings.ToLower(repoURI), "github.com/") {
		if !VerifyScopeHasAccess(ctx, actor.Scope, method, repoID) {
			_, err := (&github.Repos{}).Get(ctx, repoURI)
			if err != nil {
				// We don't know if the error is unauthenticated or unauthorized, so return unauthenticated
				// so that git clients will try again, providing authentication information.
				// If we return codes.PermissionDenied here, then git clients won't even try to supply authentication info.
				return grpc.Errorf(codes.Unauthenticated, "write operation (%s) denied: not authenticated/authorized by GitHub API", method)
			}
		}
	}
	return nil
}

// VerifyActorHasAdminAccess checks if the given actor is authorized to make
// admin requests to this server.
//
// Note that this function allows the caller to retrieve any user's
// access levels.  This is meant for trusted server code living
// outside the scope of gRPC requests to verify user permissions. For
// all other cases, VerifyUserHasAdminAccess should be used to
// authorize a user for gRPC operations.
func VerifyActorHasAdminAccess(ctx context.Context, actor auth.Actor, method string) error {
	if !actor.IsAuthenticated() {
		if VerifyScopeHasAccess(ctx, actor.Scope, method, 0) {
			return nil
		}
		return grpc.Errorf(codes.Unauthenticated, "admin operation (%s) denied: not authenticated", method)
	}

	if !actor.HasAdminAccess() {
		return grpc.Errorf(codes.PermissionDenied, "admin operation (%s) denied: not authorized", method)
	}
	return nil
}

// Check if the actor is authorized with an access token
// having a valid scope. This token is set in package cli on server
// startup, and is only available to client commands spawned
// in the server process.
//
// !!!!!!!!!!!!!!!!!!!! DANGER(security) !!!!!!!!!!!!!!!!!!!!!!
// This does not check that the token is properly signed, since
// that is done in server/internal/oauth2util/grpc_middleware.go
// when parsing the request metadata and adding the actor to the
// context. To avoid additional latency from expensive public key
// operations, that check is not repeated here, but be careful
// about refactoring that check.
func VerifyScopeHasAccess(ctx context.Context, scopes map[string]bool, method string, repo int32) bool {
	if scopes == nil {
		return false
	}
	for scope := range scopes {
		switch {
		case strings.HasPrefix(scope, "internal:"):
			// internal server commands have default write access.
			return true

		case scope == "worker:build":
			return true

		case strings.HasPrefix(scope, "repo:"):
			scopeRepo, err := strconv.Atoi(strings.TrimPrefix(scope, "repo:"))
			if err != nil {
				return false
			}
			if repo != 0 && int32(scopeRepo) == repo {
				return true
			}
		}
	}
	return false
}

// inAuthenticatedWriteWhitelist reports if we always allow write access
// for method to any authenticated user.
func inAuthenticatedWriteWhitelist(method string) bool {
	switch method {
	case "MirrorRepos.cloneRepo":
		// This is used for read-only users to be able to trigger mirror clones
		// of public repositories, effectively "enabling" that repository.
		return true
	default:
		return false
	}
}
