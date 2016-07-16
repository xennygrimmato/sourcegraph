package e2e

import (
	"os"

	"sourcegraph.com/sourcegraph/go-selenium"
)

func init() {
	registerTest := func(name, q string) {
		Register(&Test{
			Name:        name,
			Description: "fetch every search item on sourcegraph.com for Go, ensure each first listing has usage examples",
			Func: func(t *T) error {
				return runSearchFlow(t, q)
			},
		})
	}

	registerTest("search_flow_0", "new http request")
	registerTest("search_flow_1", "read file")
	registerTest("search_flow_2", "json encoder")
	registerTest("search_flow_3", "sql query")
	registerTest("search_flow_4", "indent json")
}

func runSearchFlow(t *T, query string) error {
	if ci := os.Getenv("CI"); ci != "" {
		// TODO: Use gRPC to add the repositories that we expect to have
		// indexed by search.
		t.Logf("TODO: search_flow test does not work on CI (expects existing repos)")
		return nil
	}

	wd := t.WebDriver

	err := wd.Get(t.Endpoint("/search"))
	if err != nil {
		return err
	}

	searchInput := t.WaitForElement(selenium.ById, "e2etest-search-input")
	searchInput.SendKeys(query)

	// Since the search results are listed in `code` tags,
	// this will find the first search result (so it can be clicked)
	t.Click(selenium.ByTagName, "code")

	// The usage examples are in `table` elements
	t.WaitForElement(selenium.ByTagName, "table")
	return nil
}
