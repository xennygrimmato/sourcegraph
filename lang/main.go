// +build ignore

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"golang.org/x/net/context"
	"golang.org/x/tools/godoc/vfs"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/vfsutil"

	_ "sourcegraph.com/sourcegraph/sourcegraph/lang/all"
)

var (
	dir       = flag.String("dir", ".", "directory to index (recursively)")
	timeout   = flag.Duration("timeout", time.Second, "maximum allowed time")
	origin    = flag.String("origin", "", "glob pattern to specify origins (see `godoc path Match`)")
	verbose   = flag.Bool("v", false, "show verbose output")
	printRefs = flag.Bool("refs", false, "print refs")
	match     = flag.String("m", "", "print only refs/defs whose id contains m")
	printDefs = flag.Bool("defs", false, "print defs")
	stats     = flag.Bool("stats", true, "show file stats")
)

func main() {
	flag.Parse()

	first := true
	fileStats := map[string]*indexStats{}
	for langName, fis := range byLang {
		if *verbose {
			if !first {
				fmt.Println()
			}
			fmt.Printf("# %T\n", langName)
		}
		for i, fi := range fis {
			if *stats {
				for filename, data := range refs.Files {
					if _, present := fileStats[filename]; !present {
						fileStats[filename] = &indexStats{}
					}
					fileStats[filename].refs += len(data.Refs)
					for _, ref := range data.Refs {
						if ref.Target != nil && ref.Target.Exact {
							fileStats[filename].exactRefs++
						}
						if ref.Target == nil || ref.Target.Span == nil {
							fileStats[filename].queryRefs++
						}
					}
				}
				for _, def := range defs.Defs {
					if _, present := fileStats[def.Path]; !present {
						fileStats[def.Path] = &indexStats{}
					}
					fileStats[def.Path].defs++
				}
			}
		}
	}
	if *stats {
		var overall indexStats
		for _, origin := range sortFilenames(fileStats) {
			stats := fileStats[origin]
			fmt.Printf("# %s: %s\n", origin, stats)
			overall.defs += stats.defs
			overall.refs += stats.refs
			overall.exactRefs += stats.exactRefs
			overall.queryRefs += stats.queryRefs
		}
		if len(fileStats) > 1 {
			fmt.Printf("# OVERALL: %s\n", overall)
		}
	}
}

func sortFilenames(m map[string]*indexStats) []string {
	names := make([]string, 0, len(m))
	for name := range m {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

type indexStats struct {
	defs int

	refs      int
	exactRefs int
	queryRefs int
}

func (s indexStats) String() string {
	return fmt.Sprintf("%d defs; %d refs (%.1f%% exact, %.1f%% query)",
		s.defs,
		s.refs, float64(s.exactRefs)/float64(s.refs)*100, float64(s.queryRefs)/float64(s.refs)*100)
}
