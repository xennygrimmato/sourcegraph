package oauth2util

import (
	"github.com/dgrijalva/jwt-go"
	"gopkg.in/inconshreveable/log15.v2"
	"strings"

	"golang.org/x/net/context"
	"golang.org/x/oauth2"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/auth"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/auth/accesstoken"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/auth/idkey"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store"
)

// GRPCMiddleware reads the OAuth2 access token from the gRPC call's
// metadata. If present and valid, its information is added to the
// context.
//
// Lack of authentication is not an error, but a failed authentication
// attempt does result in a non-nil error.
func GRPCMiddleware(ctx context.Context) (context.Context, error) {
	md, ok := metadata.FromContext(ctx)
	if !ok {
		return ctx, nil
	}

	authMD, ok := md["authorization"]
	if !ok || len(authMD) == 0 {
		return ctx, nil
	}

	// This is for backwards compatibility with client instances that are running older versions
	// of sourcegraph (< v0.7.22).
	// TODO: remove this hack once clients upgrade to binaries having the new grpc-go API.
	authToken := authMD[len(authMD)-1]

	parts := strings.SplitN(authToken, " ", 2)
	if len(parts) != 2 {
		return nil, grpc.Errorf(codes.InvalidArgument, "invalid authorization metadata")
	}
	if !strings.EqualFold(parts[0], "bearer") {
		return ctx, nil
	}

	tokStr := parts[1]
	if tokStr == "" {
		return ctx, nil
	}

	actor, err := accesstoken.ParseAndVerify(idkey.FromContext(ctx), tokStr)
	if err != nil {
		if vErr, ok := err.(*jwt.ValidationError); ok && vErr.Errors&jwt.ValidationErrorExpired != 0 {
			return ctx, nil
		}
		log15.Error("access token middleware failed to parse/verify token", "error", err)
		return ctx, nil
	}

	// Make future calls use this access token.
	ctx = sourcegraph.WithCredentials(ctx, oauth2.StaticTokenSource(&oauth2.Token{TokenType: "Bearer", AccessToken: tokStr}))
	if actor != nil {
		ctx = auth.WithActor(ctx, *actor)
	}

	// Now that the context is populated, we do a final check to see this isn't a blacklisted token before we allow
	// a user to access resources with it
	blackliststore := store.BlacklistedSessionTokensFromContext(ctx)
	blacklistResp, blErr := blackliststore.CheckSessionTokenBlacklist(ctx, int32(actor.UID), tokStr)
	if blacklistResp.Ok == false {
		log15.Error("Blacklisted token found in authorization header", "token", tokStr, "error", blErr)

		return nil, grpc.Errorf(codes.Unauthenticated, "unauthorized access attempt")
	}

	return ctx, nil
}
