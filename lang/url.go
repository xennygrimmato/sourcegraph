package lang

import (
	"fmt"
	"net/url"
	"strings"

	approuter "sourcegraph.com/sourcegraph/sourcegraph/app/router"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/routevar"
)

func DefURL(t *Target, repo, commitID string) string {
	var u *url.URL
	if t != nil {
		if t.File != "" {
			u = approuter.Rel.URLToBlob(repo, commitID, t.File)
			// TODO(sqs): include name in fragment (or something) to specially highlight the name
		}
		if t.Span != nil {
			endLine := t.Span.EndLine
			if endLine == 0 {
				endLine = t.Span.StartLine
			}
			if u == nil {
				u = &url.URL{}
			}
			u.Fragment = fmt.Sprintf("L%d:%d-%d:%d", t.Span.StartLine, t.Span.StartCol, endLine, t.Span.EndCol)
		}

		if u == nil {
			if c := t.Constraints; c != nil && c["go_package_import_path"] != "" {
				repo := c["go_package_import_path"]
				if !strings.Contains(repo, ".") {
					// Go stdlib
					repo = "github.com/golang/go"
				}
				if strings.HasPrefix(repo, "sourcegraph.com/sourcegraph/sourcegraph/") {
					repo = "sourcegraph.com/sourcegraph/sourcegraph"
				}
				u = approuter.Rel.URLToDef(routevar.DefAtRev{
					RepoRev:  routevar.RepoRev{Repo: repo},
					Unit:     c["go_package_import_path"],
					UnitType: "GoPackage",
					Path:     strings.Replace(t.Id, ".", "/", -1),
				})
			}
		}

		if u == nil {
			var query string
			// TODO(sqs): apply the target constraints
			if t != nil && t.Id != "" {
				query += t.Id
			} else {
				query += "%s" // frontend will replace with text of ref
			}
			if t != nil && t.File != "" {
				// TODO(sqs): support searching within a file or dir (not just repo)
				query += " r:" + repo
			}
			u = approuter.Rel.URLToSearch(strings.TrimSpace(query))
		}
	}
	if u == nil {
		return ""
	}
	return u.String()
}
