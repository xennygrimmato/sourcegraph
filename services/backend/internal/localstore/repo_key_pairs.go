package localstore

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/pem"
	"fmt"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/auth/idkey"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store"
	"sourcegraph.com/sourcegraph/sourcegraph/services/backend/accesscontrol"
)

// repoKey is a private key used to access a repository hosted on an
// external origin service (e.g., GitHub).
type repoKey struct {
	Repo          int32  `db:"repo_id"`
	PrivateKeyPEM string `db:"private_key_pem"`
}

func init() {
	AppSchema.Map.AddTableWithName(repoKey{}, "repo_key_pair").SetKeys(false, "Repo")
	AppSchema.CreateSQL = append(AppSchema.CreateSQL,
		`ALTER TABLE repo_key_pair ALTER COLUMN private_key_pem TYPE text;`,
	)
}

// repoKeyPairs is a DB-backed implementation of the RepoKeyPairs store.
type repoKeyPairs struct{}

var _ store.RepoKeyPairs = (*repoKeyPairs)(nil)

func (s *repoKeyPairs) Create(ctx context.Context, repo int32, privKey *rsa.PrivateKey) error {
	if err := accesscontrol.VerifyUserHasWriteAccess(ctx, "RepoKeyPairs.Create", repo); err != nil {
		return err
	}
	block, err := x509.EncryptPEMBlock(rand.Reader, "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(privKey), pemPasswordForRepoKeyPair(ctx, repo), x509.PEMCipherAES128)
	if err != nil {
		return err
	}
	pemBytes := pem.EncodeToMemory(block)

	sql := `
WITH update_result AS (
  UPDATE repo_key_pair SET private_key_pem=$2 WHERE repo_id=$1
  RETURNING 1
),
insert_data AS (
  SELECT $1 AS repo_id, $2 AS private_key_pem
)
INSERT INTO repo_key_pair(repo_id, private_key_pem)
SELECT * FROM insert_data
WHERE NOT EXISTS (SELECT NULL FROM update_result);
`
	if _, err := appDBH(ctx).Exec(sql, repo, string(pemBytes)); err != nil {
		return err
	}
	return nil
}

func (s *repoKeyPairs) GetPEM(ctx context.Context, repo int32) ([]byte, error) {
	if err := accesscontrol.VerifyUserHasWriteAccess(ctx, "RepoKeyPairs.GetPEM", repo); err != nil {
		return nil, err
	}
	var k repoKey
	if err := appDBH(ctx).SelectOne(&k, `SELECT * FROM repo_key_pair WHERE repo_id=$1 LIMIT 1`, repo); err == sql.ErrNoRows {
		return nil, grpc.Errorf(codes.NotFound, "no key pair for repo %d", repo)
	} else if err != nil {
		return nil, err
	}

	block, _ := pem.Decode([]byte(k.PrivateKeyPEM))
	d, err := x509.DecryptPEMBlock(block, pemPasswordForRepoKeyPair(ctx, repo))
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: d}), nil
}

func (s *repoKeyPairs) Delete(ctx context.Context, repo int32) error {
	if err := accesscontrol.VerifyUserHasWriteAccess(ctx, "RepoKeyPairs.Delete", repo); err != nil {
		return err
	}
	_, err := appDBH(ctx).Exec(`DELETE FROM repo_key_pair WHERE repo_id=$1;`, repo)
	return err
}

// pemPasswordForRepoKeyPair derives a password from the server's ID
// key for encrypting the repo key pair PEM.
//
// SECURITY NOTE: The encryption/decryption of the key pair is handled
// entirely internally to this package. We do not expose an encryption
// or decryption oracle, so we can use the server's private ID key
// (albeit hashed with the repo ID to avoid exposing an oracle to an
// attacker who successfully gets access to the DB).
func pemPasswordForRepoKeyPair(ctx context.Context, repo int32) []byte {
	b, err := idkey.FromContext(ctx).MarshalText()
	if err != nil || b == nil {
		panic("couldn't get private key bytes")
	}

	var buf bytes.Buffer
	if _, err := buf.WriteString("repo-key-pair:"); err != nil {
		panic(err)
	}
	if _, err := fmt.Fprint(&buf, repo, ":"); err != nil {
		panic(err)
	}
	if _, err := buf.Write(b); err != nil {
		panic(err)
	}

	s := sha256.Sum256(buf.Bytes())
	return s[:]
}
