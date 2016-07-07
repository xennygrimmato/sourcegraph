package lang

import (
	"io/ioutil"
	"os"
	"time"

	"github.com/kr/fs"
	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/inventory/filelang"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/vfsutil"
)

// IndexOps determines the indexing operations that should be invoked
// for the given filesystem, based on the files' extensions and the
// available indexers.
//
// If isTarget is set, only source files whose filename passes
// isTarget are used as the target files. (All source files are still
// included in the IndexOp.Sources maps).
//
// TODO(sqs): Only draws from InProcessIndexer.
func IndexOps(ctx context.Context, vfs vfsutil.WalkableFileSystem, isTarget func(filename string) bool) (map[InProcessIndexer][]*IndexOp, error) {
	ops := map[InProcessIndexer][]*IndexOp{}

	// Respect deadline.
	//
	// TODO(sqs): Also support ctx cancelation.
	deadline, hasDeadline := ctx.Deadline()
	const finishTime = 15 * time.Millisecond

	w := fs.WalkFS("", vfs)
	for w.Step() {
		if hasDeadline && deadline.Sub(time.Now()) < finishTime {
			return nil, context.DeadlineExceeded
		}

		if err := w.Err(); err != nil {
			if w.Path() != "" && w.Path() != "." && w.Path() != "/" && (os.IsNotExist(err) || os.IsPermission(err)) {
				continue
			}
			return nil, err
		}

		fi := w.Stat()
		if filelang.IsVendored(w.Path(), w.Stat().Mode().IsDir()) {
			// TODO(sqs): skip vendored files?
			w.SkipDir()
			continue
		}
		if fi.Mode().IsRegular() {
			matchedLangs := filelang.Langs.ByFilename(fi.Name())
			for _, lang := range matchedLangs {
				if indexer, present := InProcessIndexersByLang[lang.Name]; present {
					// TODO(sqs): don't put all files in the same
					// IndexOp; break up by language for now?
					if len(ops[indexer]) == 0 {
						ops[indexer] = []*IndexOp{
							{Sources: map[string][]byte{}},
						}
					}
					op := ops[indexer][0]

					f, err := vfs.Open(w.Path())
					if err != nil {
						return nil, err
					}
					data, err := ioutil.ReadAll(f)
					f.Close()
					if err != nil {
						return nil, err
					}

					op.Sources[w.Path()] = data
					if isTarget == nil || isTarget(w.Path()) {
						op.Targets = append(op.Targets, w.Path())
					}
				}
			}
		}
	}

	return ops, nil
}

// MergeResults merges all of results into a single IndexResult. It
// modifies the provided results; they should not be used after
// calling MergeResults on them.
func MergeResults(results []*IndexResult) *IndexResult {
	merged := &IndexResult{}
	for _, res := range results {
		if merged.Files == nil {
			merged.Files = res.Files
		} else {
			for f, d := range res.Files {
				if x := merged.Files[f]; x == nil {
					merged.Files[f] = d
				} else {
					merged.Files[f].Defs = append(merged.Files[f].Defs, d.Defs...)
					merged.Files[f].Refs = append(merged.Files[f].Refs, d.Refs...)
				}
			}
		}
		merged.Messages = append(merged.Messages, res.Messages...)
		if !res.Complete {
			merged.Complete = false
		}
	}
	return merged
}
