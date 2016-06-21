package ext

import (
	"golang.org/x/crypto/ssh"
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
)

// A RepoOriginWithAuthorizedSSHKeys is a repo external origin that
// supports accessing repos via SSH private-key authentication. It is
// implemented by adapters for external services, such as GitHub.
//
// SSH key access is generally only necessary for private repositories
// and for write operations on public repositories.
type RepoOriginWithAuthorizedSSHKeys interface {
	// IsSSHKeyAuthorized determines if the given public key is
	// authorized for access to the repo.
	IsSSHKeyAuthorized(ctx context.Context, repo sourcegraph.Origin, key ssh.PublicKey) (bool, error)

	// AuthorizeSSHKey authorizes the keypair for access to the repo.
	AuthorizeSSHKey(ctx context.Context, repo sourcegraph.Origin, key ssh.PublicKey) error

	// DeleteSSHKey deauthorizes and removes a previously authorized
	// SSH keypair.
	DeleteSSHKey(ctx context.Context, repo sourcegraph.Origin, key ssh.PublicKey) error
}
