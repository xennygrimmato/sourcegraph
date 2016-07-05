package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"

	"sourcegraph.com/sourcegraph/go-flags"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
)

func initRepoConfigCmds(repoGroup *flags.Command) {
	g, err := repoGroup.AddCommand("config",
		"manage repo config",
		"The 'src repo config' group's commands manage the configuration of repositories.",
		&repoConfigCmd{},
	)
	if err != nil {
		log.Fatal(err)
	}

	_, err = g.AddCommand("get",
		"get a repo's config",
		"The get subcommand gets a repository's configuration.",
		&repoConfigGetCmd{},
	)
	if err != nil {
		log.Fatal(err)
	}

	_, err = g.AddCommand("update",
		"update a repo's config",
		"The update subcommand updates a repository's configuration.",
		&repoConfigUpdateCmd{},
	)
	if err != nil {
		log.Fatal(err)
	}
}

type repoConfigCmd struct{}

func (c *repoConfigCmd) Execute(args []string) error { return nil }

type repoConfigGetCmd struct {
	Args struct {
		URI string `name:"REPO-URI" description:"repository URI (e.g., host.com/myrepo)"`
	} `positional-args:"yes" required:"yes" count:"1"`
}

func (c *repoConfigGetCmd) Execute(args []string) error {
	cl := cliClient

	res, err := cl.Repos.Resolve(cliContext, &sourcegraph.RepoResolveOp{Path: c.Args.URI})
	if err != nil {
		return err
	}
	repoSpec := &sourcegraph.RepoSpec{ID: res.Repo}

	conf, err := cl.Repos.GetConfig(cliContext, repoSpec)
	if err != nil {
		return err
	}
	b, err := json.MarshalIndent(conf, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(b))

	return nil
}

type repoConfigUpdateCmd struct {
	Args struct {
		Repo string `name:"REPO" description:"repository URI (e.g., host.com/myrepo)"`
	} `positional-args:"yes" required:"yes" count:"1"`

	Enable  bool `long:"enable" description:"enable repo"`
	Disable bool `long:"disable" description:"disable repo"`
}

func (c *repoConfigUpdateCmd) Execute(args []string) error {
	cl := cliClient

	if (!c.Enable && !c.Disable) || (c.Enable && c.Disable) {
		return errors.New("exactly one of --enable and --disable must be specified")
	}

	res, err := cl.Repos.Resolve(cliContext, &sourcegraph.RepoResolveOp{Path: c.Args.Repo})
	if err != nil {
		return err
	}

	repo, err := cl.Repos.Get(cliContext, &sourcegraph.RepoSpec{ID: res.Repo})
	if err != nil {
		return err
	}

	var verb string
	op := &sourcegraph.RepoUpdateConfigOp{Repo: repo.ID}
	if c.Enable {
		op.Enabled = &sourcegraph.BoolValue{Value: true}
		verb = "enabled"
	}
	if c.Disable {
		op.Enabled = &sourcegraph.BoolValue{Value: true}
		verb = "disabled"
	}
	_, err = cl.Repos.UpdateConfig(cliContext, op)
	if err != nil {
		return err
	}

	fmt.Printf("# %s: %s\n", repo.URI, verb)

	return nil
}
