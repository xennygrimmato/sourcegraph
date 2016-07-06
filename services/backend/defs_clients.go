package backend

import (
	"sort"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"golang.org/x/net/context"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/services/svc"
)

func (s *defs) ListClients(ctx context.Context, op *sourcegraph.DefsListClientsOp) (*sourcegraph.DefClientList, error) {
	if op.Repo == 0 || op.CommitID == "" {
		return nil, grpc.Errorf(codes.InvalidArgument, "Defs.ListClients requires both Repo and CommitID")
	}

	def := op.Def

	refs, err := svc.Defs(ctx).ListRefs(ctx, &sourcegraph.DefsListRefsOp{
		Def: def,
		Opt: &sourcegraph.DefListRefsOptions{
			Repo:        op.Repo,
			CommitID:    op.CommitID,
			Authorship:  true,
			ListOptions: sourcegraph.ListOptions{PerPage: 1000},
		},
	})
	if err != nil {
		return nil, err
	}

	clients := map[string]*sourcegraph.DefClient{}
	for i, ref := range refs.Refs {
		a := refs.Authors[i]
		if a == nil {
			continue
		}

		// Create if not exists.
		if _, present := clients[a.Email]; !present {
			clients[a.Email] = &sourcegraph.DefClient{
				Email:     a.Email,
				AvatarURL: gravatarURL(a.Email, 48),
			}
		}

		// Merge.
		c := clients[a.Email]
		if c.LastCommitDate.Time().Before(a.LastCommitDate.Time()) {
			c.LastCommitDate = a.LastCommitDate
			c.LastCommitID = a.LastCommitID
		}
		c.Refs = append(c.Refs, ref)
	}

	clientsList := make([]*sourcegraph.DefClient, 0, len(clients))
	for _, c := range clients {
		clientsList = append(clientsList, c)
	}

	sort.Sort(defClientsByRefLen(clientsList))
	return &sourcegraph.DefClientList{DefClients: clientsList}, nil
}

type defClientsByRefLen []*sourcegraph.DefClient

func (v defClientsByRefLen) Len() int { return len(v) }
func (v defClientsByRefLen) Less(i, j int) bool {
	return len(v[i].Refs) > len(v[j].Refs) || (len(v[i].Refs) == len(v[j].Refs) && v[i].Email < v[j].Email)
}
func (v defClientsByRefLen) Swap(i, j int) { v[i], v[j] = v[j], v[i] }
