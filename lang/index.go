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
// TODO(sqs): Only draws from InProcessIndexer.
func IndexOps(ctx context.Context, vfs vfsutil.WalkableFileSystem) (map[InProcessIndexer][]*IndexOp, error) {
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
					op.Targets = append(op.Targets, w.Path())
				}
			}
		}
	}

	return ops, nil
}
