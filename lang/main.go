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

	ctx := context.Background()
	if *timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithDeadline(ctx, time.Now().Add(*timeout))
		defer cancel()
	}

	if fi, err := os.Stat(*dir); err != nil {
		fmt.Fprintf(os.Stderr, "error: stat %s: %s\n", *dir, err)
		os.Exit(1)
	} else if !fi.Mode().IsDir() {
		fmt.Fprintf(os.Stderr, "error: not a directory: %s\n", *dir)
		os.Exit(int(syscall.ENOTDIR))
	}

	var isOrigin func(string) bool
	if *origin != "" {
		if _, err := path.Match(*origin, "test pattern"); err != nil {
			fmt.Fprintf(os.Stderr, "error: bad origin pattern %q: %s\n", *origin, err)
			os.Exit(1)
		}
		isOrigin = func(filename string) bool {
			matched, _ := path.Match(*origin, filename)
			return matched
		}
	}

	byLang, err := lang.Files(ctx, vfsutil.Walkable(vfs.OS(*dir), filepath.Join), isOrigin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: finding file inputs for %s: %s\n", *dir, err)
		os.Exit(1)
	}

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
			if *verbose {
				if i != 0 {
					fmt.Println()
				}
				origins := make(map[string]struct{}, len(fi.Origins))
				for _, f := range fi.Origins {
					origins[f] = struct{}{}
				}

				for f := range fi.Sources {
					fmt.Print(" - ", f)
					if _, isOrigin := origins[f]; isOrigin {
						fmt.Print(" (ORIGIN)")
					}
					fmt.Println()
				}
			}

			fileSpans := make([]*lang.RefsOp_FileSpan, len(fi.Origins))
			for i, origin := range fi.Origins {
				fileSpans[i] = &lang.RefsOp_FileSpan{File: origin} // span entire file (nil span)
			}

			cl, err := lang.ClientForLang(langName)
			if err != nil {
				fmt.Fprintf(os.Stderr, "error: getting client for lang %q: %s\n", langName, err)
				os.Exit(1)
			}

			defs, err := cl.Defs(ctx, &lang.DefsOp{
				Sources: fi.Sources,
				Origins: fi.Origins,
			})
			if err != nil {
				fmt.Fprintf(os.Stderr, "error: invoking defs for lang %s: %s\n", langName, err)
				os.Exit(1)
			}
			if *printDefs {
				data, err := json.MarshalIndent(filterDefs(defs), "", "  ")
				if err != nil {
					panic(err)
				}
				fmt.Println(string(data))
			}

			refs, err := cl.Refs(ctx, &lang.RefsOp{
				Sources: fi.Sources,
				Origins: fileSpans,
			})
			if err != nil {
				fmt.Fprintf(os.Stderr, "error: invoking refs for lang %s: %s\n", langName, err)
				os.Exit(1)
			}
			if *printRefs {
				data, err := json.MarshalIndent(filterRefs(refs), "", "  ")
				if err != nil {
					panic(err)
				}
				fmt.Println(string(data))
			}

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

func filterDefs(defs *lang.DefsResult) *lang.DefsResult {
	if *match == "" {
		return defs
	}
	tmp := *defs
	tmp.Defs = nil
	for _, def := range defs.Defs {
		if strings.Contains(def.Id, *match) {
			tmp.Defs = append(tmp.Defs, def)
		}
	}
	return &tmp
}

func filterRefs(refs *lang.RefsResult) *lang.RefsResult {
	if *match == "" {
		return refs
	}
	tmp := *refs
	tmp.Files = make(map[string]*lang.Refs, len(refs.Files))
	for file, refs := range refs.Files {
		if _, present := tmp.Files[file]; !present {
			tmp.Files[file] = &lang.Refs{}
		}
		for _, ref := range refs.Refs {
			if ref.Target != nil && strings.Contains(ref.Target.Id, *match) {
				tmp.Files[file].Refs = append(tmp.Files[file].Refs, ref)
			}
		}
	}
	return &tmp
}
