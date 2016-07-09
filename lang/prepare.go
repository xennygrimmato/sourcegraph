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

type FileInput struct {
	Sources map[string][]byte
	Origins []string
}

// FileInputs walks the filesystem and collects all files into the sources
// map and origins list, grouped by their language.
//
// If isOrigin is set, only source files whose filename passes
// isOrigin are used as the origin files. (All source files are still
// included sources map).
func Files(ctx context.Context, vfs vfsutil.WalkableFileSystem, isOrigin func(filename string) bool) (map[string][]*FileInput, error) {
	byLang := map[string][]*FileInput{}

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
				if _, present := Langs[lang.Name]; present {
					// TODO(sqs): don't put all files in the same
					// DefsOp; break up by language for now?
					if len(byLang[lang.Name]) == 0 {
						byLang[lang.Name] = []*FileInput{
							{Sources: map[string][]byte{}},
						}
					}
					op := byLang[lang.Name][0]

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
					if isOrigin == nil || isOrigin(w.Path()) {
						op.Origins = append(op.Origins, w.Path())
					}
				}
			}
		}
	}

	return byLang, nil
}

// MergeDefsResults merges all of results into a single DefsResult. It
// modifies the provided results; they should not be used after
// calling MergeDefsResults on them.
func MergeDefsResults(results []*DefsResult) *DefsResult {
	merged := &DefsResult{}
	for _, res := range results {
		merged.Defs = append(merged.Defs, res.Defs...)
		merged.Messages = append(merged.Messages, res.Messages...)
		if !res.Complete {
			merged.Complete = false
		}
	}
	return merged
}

// MergeRefsResults merges all of results into a single RefsResult. It
// modifies the provided results; they should not be used after
// calling MergeRefsResults on them.
func MergeRefsResults(results []*RefsResult) *RefsResult {
	merged := &RefsResult{}
	for _, res := range results {
		if merged.Files == nil {
			merged.Files = res.Files
		} else {
			for filename, refs := range res.Files {
				merged.Files[filename].Refs = append(merged.Files[filename].Refs, refs.Refs...)
			}
		}
		merged.Messages = append(merged.Messages, res.Messages...)
		if !res.Complete {
			merged.Complete = false
		}
	}
	return merged
}
