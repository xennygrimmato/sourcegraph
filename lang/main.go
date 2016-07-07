// +build ignore

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/net/context"
	"golang.org/x/tools/godoc/vfs"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/vfsutil"

	_ "sourcegraph.com/sourcegraph/sourcegraph/lang/all"
)

var (
	dir     = flag.String("dir", ".", "directory to index (recursively)")
	timeout = flag.Duration("timeout", time.Second, "maximum allowed time")
	verbose = flag.Bool("v", false, "show verbose output")
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

	opsByIndexer, err := lang.IndexOps(ctx, vfsutil.Walkable(vfs.OS(*dir), filepath.Join))
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: finding index ops for %s: %s\n", *dir, err)
		os.Exit(1)
	}

	first := true
	for indexer, ops := range opsByIndexer {
		if *verbose {
			if !first {
				fmt.Println()
			}
			fmt.Printf("# %T\n", indexer)
		}
		for i, op := range ops {
			if *verbose {
				if i != 0 {
					fmt.Println()
				}
				targets := make(map[string]struct{}, len(op.Targets))
				for _, t := range op.Targets {
					targets[t] = struct{}{}
				}

				for f := range op.Sources {
					fmt.Print(" - ", f)
					if _, isTarget := targets[f]; isTarget {
						fmt.Print(" (TARGET)")
					}
					fmt.Println()
				}
			}

			res, err := indexer.Index(ctx, op)
			if err != nil {
				fmt.Fprintf(os.Stderr, "error: invoking indexer %T: %s\n", indexer, err)
				os.Exit(1)
			}

			data, err := json.MarshalIndent(res, "", "  ")
			if err != nil {
				panic(err)
			}
			fmt.Println(string(data))
		}
	}
}
