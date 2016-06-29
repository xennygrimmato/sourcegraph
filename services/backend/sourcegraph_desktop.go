package backend

import (
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/githubutil"
)

var SourcegraphDesktop sourcegraph.SourcegraphDesktopServer = &sourcegraphdesktop{}

type sourcegraphdesktop struct{}

var _ sourcegraph.SourcegraphDesktopServer = (*sourcegraphdesktop)(nil)

func (s *sourcegraphdesktop) GetLatest(ctx context.Context, clientVersion *sourcegraph.ClientDesktopVersion) (*sourcegraph.LatestDesktopVersion, error) {
	gh := githubutil.Default.UnauthedClient()

	latestRelease, _, err := gh.Repositories.GetLatestRelease("sourcegraph", "sourcegraph-desktop")
	if err != nil {
		return nil, err
	}

	latest := &sourcegraph.LatestDesktopVersion{
		Version: *latestRelease.TagName,
	}

	return latest, nil

}
