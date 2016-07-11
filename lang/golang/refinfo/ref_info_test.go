package refinfo

import (
	"fmt"
	"io/ioutil"
	"regexp"
	"strings"
	"testing"

	"golang.org/x/tools/go/buildutil"
)

func TestSingleFile(t *testing.T) {
	b, err := ioutil.ReadFile("testdata/src/p/f.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)

	checks, err := parseCheckComments(src)
	if err != nil {
		t.Fatal(err)
	}

	doTest(t, checks, "p/f.go", &Config{
		Build: buildutil.FakeContext(map[string]map[string]string{"p": {"f.go": src}}),
	})
}

func doTest(t *testing.T, checks []checkComment, file string, cfg *Config) {
	for _, c := range checks {
		res, err := Get()
	}
}

type checkComment struct {
	offset    int
	wantPkg   string
	wantName1 string
	wantName2 string
	label     string
}

func parseCheckComments(src string) ([]checkComment, error) {
	pat := regexp.MustCompile(`\s*(?P<ref>.+)\s*//(?:(?P<tok>\w+):)? (?P<pkg>[\w/.-]+)(?: (?P<name1>\w+)(?: (?P<name2>\w+))?)?`)
	matches := pat.FindAllStringSubmatchIndex(src, -1)
	if numTests := strings.Count(src, " //"); len(matches) != numTests {
		return nil, fmt.Errorf("source has %d tests (lines with ' // '), but %d matches found (regexp probably needs to be updated to include new styles of test specifications)", numTests, len(matches))
	}

	var checks []checkComment
	for _, m := range matches {
		ref := src[m[2]:m[3]]

		// Narrow the ref if the tok is provided.
		var tokIdxInRef, tokLen int
		if m[4] == -1 {
			// Take right-most component of dotted selector.
			tokIdxInRef = strings.LastIndex(ref, ".")
			if tokIdxInRef == -1 {
				tokIdxInRef = 0
			}
			tokLen = len(ref) - tokIdxInRef
		} else {
			tok := src[m[4]:m[5]]
			tokLen = len(tok)
			tokIdxInRef = strings.Index(ref, tok)
			if tokIdxInRef == -1 {
				return nil, fmt.Errorf("could not find token %q in ref %q", tok, ref)
			}
		}
		ref = ref[tokIdxInRef : tokIdxInRef+tokLen]
		m[2] += tokIdxInRef

		m[2]++
		wantPkg := src[m[6]:m[7]]
		var wantName1, wantName2 string
		if m[8] != -1 {
			wantName1 = src[m[8]:m[9]]
		}
		if m[10] != -1 {
			wantName2 = src[m[10]:m[11]]
		}

		label := fmt.Sprintf("ref %q at offset %d", ref, m[2])
		checks = append(checks, checkComment{
			offset:    m[2],
			wantPkg:   wantPkg,
			wantName1: wantName1,
			wantName2: wantName2,
			label:     label,
		})
	}
	return checks, nil
}
