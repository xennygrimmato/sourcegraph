package backend

import (
	"path"

	"github.com/rogpeppe/rog-go/parallel"

	"gopkg.in/inconshreveable/log15.v2"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"

	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/store"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/vcs"
	"sourcegraph.com/sourcegraph/sourcegraph/services/backend/accesscontrol"
	"sourcegraph.com/sourcegraph/sourcegraph/services/svc"
	"sourcegraph.com/sourcegraph/srclib/graph"
	srcstore "sourcegraph.com/sourcegraph/srclib/store"
	"sourcegraph.com/sqs/pbtypes"
)

func (s *defs) ListRefs(ctx context.Context, op *sourcegraph.DefsListRefsOp) (*sourcegraph.RefList, error) {
	defSpec := op.Def
	opt := op.Opt
	if opt == nil {
		opt = &sourcegraph.DefListRefsOptions{}
	}

	// Restrict the ref search to a single repo and commit for performance.
	if opt.Repo == 0 && defSpec.Repo != 0 {
		opt.Repo = defSpec.Repo
	}
	if opt.CommitID == "" {
		opt.CommitID = defSpec.CommitID
	}
	if opt.Repo == 0 {
		return nil, grpc.Errorf(codes.InvalidArgument, "ListRefs: Repo must be specified")
	}
	if opt.CommitID == "" {
		return nil, grpc.Errorf(codes.InvalidArgument, "ListRefs: CommitID must be specified")
	}

	defRepoObj, err := svc.Repos(ctx).Get(ctx, &sourcegraph.RepoSpec{ID: defSpec.Repo})
	if err != nil {
		return nil, err
	}
	if err := accesscontrol.VerifyUserHasReadAccess(ctx, "Defs.ListRefs", defRepoObj.ID); err != nil {
		return nil, err
	}

	refRepoObj, err := svc.Repos(ctx).Get(ctx, &sourcegraph.RepoSpec{ID: opt.Repo})
	if err != nil {
		return nil, err
	}
	if err := accesscontrol.VerifyUserHasReadAccess(ctx, "Defs.ListRefs", refRepoObj.ID); err != nil {
		return nil, err
	}

	repoFilters := []srcstore.RefFilter{
		srcstore.ByRepos(refRepoObj.URI),
		srcstore.ByCommitIDs(opt.CommitID),
	}

	refFilters := []srcstore.RefFilter{
		srcstore.ByRefDef(graph.RefDefKey{
			DefRepo:     defRepoObj.URI,
			DefUnitType: defSpec.UnitType,
			DefUnit:     defSpec.Unit,
			DefPath:     defSpec.Path,
		}),
		srcstore.ByCommitIDs(opt.CommitID),
		srcstore.RefFilterFunc(func(ref *graph.Ref) bool { return !ref.Def }),
		srcstore.Limit(opt.Offset()+opt.Limit()+1, 0),
	}

	if len(opt.Files) > 0 {
		for i, f := range opt.Files {
			// Files need to be clean or else graphstore will panic.
			opt.Files[i] = path.Clean(f)
		}
		refFilters = append(refFilters, srcstore.ByFiles(false, opt.Files...))
	}

	filters := append(repoFilters, refFilters...)
	bareRefs, err := store.GraphFromContext(ctx).Refs(filters...)
	if err != nil {
		return nil, err
	}

	// Convert to sourcegraph.Ref and file bareRefs.
	refs := make([]*graph.Ref, 0, opt.Limit())
	for i, bareRef := range bareRefs {
		if i >= opt.Offset() && i < (opt.Offset()+opt.Limit()) {
			refs = append(refs, bareRef)
		}
	}
	hasMore := len(bareRefs) > opt.Offset()+opt.Limit()

	refList := &sourcegraph.RefList{
		Refs:           refs,
		StreamResponse: sourcegraph.StreamResponse{HasMore: hasMore},
	}

	if opt.Authorship {
		authors, err := s.listAuthorsForRefs(ctx, refList.Refs)
		if err != nil {
			return nil, err
		}
		refList.Authors = authors
	}

	return refList, nil
}

func (s *defs) listAuthorsForRefs(ctx context.Context, refs []*graph.Ref) ([]*sourcegraph.RefAuthor, error) {
	listAuthorsForRef := func(ctx context.Context, ref *graph.Ref) (*sourcegraph.RefAuthor, error) {
		res, err := svc.Repos(ctx).Resolve(ctx, &sourcegraph.RepoResolveOp{Path: ref.Repo})
		if err != nil {
			return nil, err
		}
		vcsrepo, err := store.RepoVCSFromContext(ctx).Open(ctx, res.Repo)
		if err != nil {
			return nil, err
		}
		hunks, err := blameFileByteRange(vcsrepo, ref.File,
			&vcs.BlameOptions{NewestCommit: vcs.CommitID(ref.CommitID)},
			int(ref.Start), int(ref.End))
		if err != nil {
			return nil, err
		}

		// Most refs are one-liners with only one hunk. For refs that
		// span multiple hunks, take the author to be the one who
		// contributed the most bytes.
		var hunk *vcs.Hunk
		for _, h := range hunks {
			if hunk == nil || (hunk.EndByte-hunk.StartByte) < (h.EndByte-h.StartByte) {
				hunk = h
			}
		}
		if hunk == nil {
			log15.Warn("listAuthorsForRef: No hunk for ref.", "repo", ref.Repo, "commitID", ref.CommitID, "file", ref.File, "startByte", ref.Start, "endByte", ref.End)
			return nil, nil
		}

		// Remove domain to prevent spammers from being able
		// to easily scrape emails from us.
		return &sourcegraph.RefAuthor{
			Email:     hunk.Author.Email,
			AvatarURL: gravatarURL(hunk.Author.Email, 48),
			AuthorshipInfo: sourcegraph.AuthorshipInfo{
				LastCommitID:   string(hunk.CommitID),
				LastCommitDate: hunk.Author.Date,
			},
		}, nil
	}

	authors := make([]*sourcegraph.RefAuthor, len(refs))
	par := parallel.NewRun(10)
	for i_, ref_ := range refs {
		i, ref := i_, ref_
		par.Do(func() (err error) {
			authors[i], err = listAuthorsForRef(ctx, ref)
			return
		})
	}
	if err := par.Wait(); err != nil {
		return nil, err
	}
	return authors, nil
}

func (s *defs) ListRefLocations(ctx context.Context, op *sourcegraph.DefsListRefLocationsOp) (*sourcegraph.RefLocationsList, error) {
	return store.GlobalRefsFromContext(ctx).Get(ctx, op)
}

func (s *defs) ListExamples(ctx context.Context, op *sourcegraph.DefsListExamplesOp) (*sourcegraph.RefLocationsList, error) {
	return store.DefExamplesFromContext(ctx).Get(ctx, op)
}

func (s *defs) RefreshIndex(ctx context.Context, op *sourcegraph.DefsRefreshIndexOp) (*pbtypes.Void, error) {
	if op.RefreshRefLocations {
		if err := store.GlobalRefsFromContext(ctx).Update(ctx, op); err != nil {
			return nil, err
		}
	}

	// Update defs table
	if err := store.DefsFromContext(ctx).UpdateFromSrclibStore(ctx, store.DefUpdateOp{
		Repo:     op.Repo,
		CommitID: op.CommitID,
		// TODO(beyang): this should be specified by the caller, since the last built is not necessarily the latest revision
		Latest:        true,
		RefreshCounts: true,
	}); err != nil {
		return nil, err
	}

	return &pbtypes.Void{}, nil
}
