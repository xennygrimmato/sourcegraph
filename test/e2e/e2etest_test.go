package e2e

import (
	"flag"
	"os"
	"testing"
)

func TestDefFlow(t *testing.T) {
	runE2E(t, "def_flow")
}

func TestLoginFlow(t *testing.T) {
	runE2E(t, "login_flow")
}

func TestRegisterFlow(t *testing.T) {
	runE2E(t, "register_flow")
}

func TestRepoFlow(t *testing.T) {
	runE2E(t, "repo_flow")
}

func TestSearchFlow(t *testing.T) {
	runE2E(t, "search_flow")
}

func TestChannelFlow(t *testing.T) {
	runE2E(t, "channel_flow")
}

var fatalMsg string

func TestMain(m *testing.M) {
	flag.Parse()
	err := parseEnv()
	if err != nil {
		fatalMsg = "parseEnv: " + err.Error()
	}
	seleniumTrace = testing.Verbose()
	os.Exit(m.Run())
}

func runE2E(t *testing.T, name string) {
	t.Parallel()
	var test *Test
	for _, tst := range tr.tests {
		if tst.Name == name {
			test = tst
		}
	}
	if test == nil {
		t.Fatal("Could not find test")
	}
	if fatalMsg != "" {
		t.Fatal(fatalMsg)
	}
	wd, err := tr.newWebDriver()
	if err != nil {
		t.Skip("newWebDriver:", err)
	}
	defer wd.Quit()
	e2eT := tr.newT(test, wd)
	e2eT.testingT = t
	err = test.Func(e2eT)
	if err != nil {
		t.Fatal(err)
	}
}
