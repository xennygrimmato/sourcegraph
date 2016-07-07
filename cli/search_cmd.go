package cli

import (
	"log"
	"strings"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/cli/cli"
)

func init() {
	_, err := cli.CLI.AddCommand("search",
		"search code indexed on Sourcegraph",
		"Search code indexed on Sourcegraph.",
		&searchCmd{},
	)
	if err != nil {
		log.Fatal(err)
	}
}

type searchCmd struct {
	Refresh      string `long:"refresh" description:"repository URI for which to update the search index and counts"`
	RefreshAll   string `long:"refresh-all" description:"set to 'IKnowWhatIAmDoing' to update the search index and counts for all repos (expensive, needs admin permissions)"`
	RefreshAsync bool   `long:"refresh-async" description:"queues refresh instead of blocking"`
	Limit        int32  `long:"limit" description:"limit # of search results" default:"10"`
	Args         struct {
		Query []string `name:"QUERY" description:"search query"`
	} `positional-args:"yes" required:"yes"`
}

func (c *searchCmd) Execute(args []string) error {
	if c.Refresh != "" {
		res, err := cliClient.Repos.Resolve(cliContext, &sourcegraph.RepoResolveOp{Path: c.Refresh})
		if err != nil {
			return err
		}
		return c.refresh(res.Repo)
	}
	if c.RefreshAll != "" {
		if c.RefreshAll != "IKnowWhatIAmDoing" {
			log.Fatal("Caution: --refresh-all is a very expensive operation. Use --refresh-all=IKnowWhatIAmDoing")
		}

		list, err := cliClient.Repos.List(cliContext, &sourcegraph.RepoListOptions{All: true})
		if err != nil {
			return err
		}

		for i, r := range list.Repos {
			log.Printf("%d/%d: %s", i+1, len(list.Repos), r.URI)
			if err := c.refresh(r.ID); err != nil {
				log.Println(err)
			}
		}

		return nil
	}

	query := strings.Join(c.Args.Query, " ")
	if query == "" {
		log.Fatal("src search: empty query")
	}

	results, err := cliClient.Search.Search(cliContext, &sourcegraph.SearchOp{
		Query: query,
		Opt: &sourcegraph.SearchOptions{
			ListOptions: sourcegraph.ListOptions{
				PerPage: c.Limit,
			},
		},
	})
	if err != nil {
		return err
	}

	if len(results.DefResults) == 0 {
		log.Printf("No results found.\n")
		return nil
	}

	for _, r := range results.DefResults {
		name, link := parseDef(&r.Def)
		log.Printf("%6.2f "+bold("%s")+" <%s>\n", r.Score, name, link)
	}
	return nil
}

func (c *searchCmd) refresh(repo int32) error {
	if c.RefreshAsync {
		_, err := cliClient.Async.RefreshIndexes(cliContext, &sourcegraph.AsyncRefreshIndexesOp{
			Repo:   repo,
			Source: "searchCmd",
			Force:  true,
		})
		return err
	}

	_, err := cliClient.Defs.RefreshIndex(cliContext, &sourcegraph.DefsRefreshIndexOp{
		Repo:                repo,
		RefreshRefLocations: true,
		Force:               true,
	})
	return err
}

func parseDef(def *sourcegraph.Def) (name, link string) {
	name = def.Path

	// TODO: use the react-router urlPattern for defs route instead of hard coding it.
	link = "https://sourcegraph.com/" + def.Repo + "/-/def/" + def.UnitType + "/" + def.Unit + "/-/" + def.Path
	return
}
