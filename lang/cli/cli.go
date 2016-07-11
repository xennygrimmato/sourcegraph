package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"text/tabwriter"

	"golang.org/x/tools/godoc/vfs"

	sgxcli "sourcegraph.com/sourcegraph/sourcegraph/cli/cli"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/inventory/filelang"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/vfsutil"
)

func init() {
	sgxcli.PostInit = append(sgxcli.PostInit, func() {
		g, err := sgxcli.CLI.AddCommand("lang",
			"language analysis",
			"The lang subcommands perform language analysis.",
			&langCmd,
		)
		if err != nil {
			log.Fatal(err)
		}

		_, err = g.AddCommand("defs",
			"print defs",
			"The defs subcommand analyzes files and prints definitions found in them.",
			&langDefsCmd{},
		)
		if err != nil {
			log.Fatal(err)
		}

		_, err = g.AddCommand("refs",
			"print refs",
			"The refs subcommand analyzes files and prints references found in them.",
			&langRefsCmd{},
		)
		if err != nil {
			log.Fatal(err)
		}

		_, err = g.AddCommand("toks",
			"print tokens",
			"The toks subcommand tokenizes files and prints tokens found in them.",
			&langToksCmd{},
		)
		if err != nil {
			log.Fatal(err)
		}
	})
}

var langCmd LangConfig

type LangConfig struct {
}

type langCmdCommon struct {
	Format string `short:"f" long:"format" description:"output format" choice:"text" choice:"json" default:"text" required:"yes"`
}

type fileInputArgs struct {
	Origin string `long:"origin" description:"origin file pattern (default: all sources)"`
	Args   struct {
		SourceDir string `positional-arg-name:"SOURCE-DIR"`
	} `positional-args:"yes" required:"1"`
}

func (a fileInputArgs) listFilesByLang(ctx context.Context) (map[string][]*lang.FileInput, error) {
	var isOrigin func(string) bool
	if a.Origin != "" {
		if _, err := path.Match(a.Origin, "test pattern"); err != nil {
			return nil, fmt.Errorf("bad origin pattern %q: %s", a.Origin, err)
		}
		isOrigin = func(filename string) bool {
			matched, _ := path.Match(a.Origin, filename)
			return matched
		}
	}

	if fi, err := os.Stat(a.Args.SourceDir); err != nil {
		return nil, fmt.Errorf("stat %s: %s", a.Args.SourceDir, err)
	} else if !fi.Mode().IsDir() {
		return nil, fmt.Errorf("not a directory: %s", a.Args.SourceDir)
	}

	byLang, err := lang.Files(ctx, vfsutil.Walkable(vfs.OS(a.Args.SourceDir), filepath.Join), isOrigin)
	if err != nil {
		return nil, fmt.Errorf("finding file inputs for %s: %s", a.Args.SourceDir, err)
	}
	return byLang, nil
}

func (a fileInputArgs) forEachLangWithFileInput(ctx context.Context, f func(ctx context.Context, langName string, cl lang.LangClient, fi *lang.FileInput) error) error {
	byLang, err := a.listFilesByLang(ctx)
	if err != nil {
		return err
	}

	for langName, fis := range byLang {
		cl, err := lang.ClientForLang(langName)
		if err != nil {
			return err
		}

		for _, fi := range fis {
			if err := f(ctx, langName, cl, fi); err != nil {
				return err
			}
		}
	}
	return nil
}

type langDefsCmd struct {
	langCmdCommon
	fileInputArgs
	Stats bool   `long:"stats" description:"print statistics" default:"true"`
	Match string `short:"m" long:"match" description:"only show defs containing this substring"`
}

func (c *langDefsCmd) Execute(args []string) error {
	return c.forEachLangWithFileInput(context.Background(),
		func(ctx context.Context, langName string, cl lang.LangClient, fi *lang.FileInput) error {
			defs, err := cl.Defs(ctx, &lang.DefsOp{
				Sources: fi.Sources,
				Origins: fi.Origins,
			})
			if err != nil {
				return fmt.Errorf("invoking defs for lang %s: %s", langName, err)
			}

			defs = filterDefs(defs, c.Match)

			switch c.Format {
			case "text":
				w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
				for _, def := range defs.Defs {
					fmt.Fprint(w, def.Id, "\t")

					if def.Path != "" {
						fmt.Fprint(w, def.Path)
					}
					if def.Span != nil {
						fmt.Fprintf(w, ":%d:%d", def.Span.StartLine, def.Span.StartCol)
					}
					fmt.Fprint(w, "\t")

					if len(def.Meta) != 0 {
						for i, kv := range sortMeta(def.Meta) {
							if i != 0 {
								fmt.Fprint(w, " ")
							}
							fmt.Fprintf(w, "%s=%s", quoteIfNeeded(kv[0]), quoteIfNeeded(kv[1]))
						}
					}
					fmt.Fprint(w, "\n")
				}
				if err := w.Flush(); err != nil {
					return err
				}
			case "json":
				data, err := json.MarshalIndent(defs, "", "  ")
				if err != nil {
					return err
				}
				fmt.Println(string(data))
			}

			if c.Stats {
				type stats struct {
					total int
				}
				overall := stats{total: len(defs.Defs)}
				fileStats := map[string]*stats{}
				for _, def := range defs.Defs {
					if _, present := fileStats[def.Path]; !present {
						fileStats[def.Path] = &stats{}
					}
					fileStats[def.Path].total++
				}

				w := tabwriter.NewWriter(os.Stderr, 0, 4, 2, ' ', 0)
				printStats := func(filename string, stats *stats) {
					fmt.Fprint(w, "# ", filename, "\t")
					fmt.Fprintf(w, "%d defs\t", stats.total)
					fmt.Fprint(w, "\n")
				}
				for _, filename := range sortStringMapKeys(fileStats) {
					printStats(filename, fileStats[filename])
				}
				if len(fileStats) > 1 {
					// Only overall stats if there's more than 1 file.
					printStats("OVERALL", &overall)
				}
				if err := w.Flush(); err != nil {
					return err
				}
			}

			if !defs.Complete {
				fmt.Fprintln(os.Stderr, "# INCOMPLETE")
			}
			if len(defs.Messages) > 0 {
				fmt.Fprintln(os.Stderr, "# Log messages from server:")
				for _, msg := range defs.Messages {
					fmt.Fprintln(os.Stderr, "#   ", msg)
				}
			}

			return nil
		},
	)
}

func filterDefs(defs *lang.DefsResult, match string) *lang.DefsResult {
	if match == "" {
		return defs
	}
	tmp := *defs
	tmp.Defs = nil
	for _, def := range defs.Defs {
		if strings.Contains(def.Id, match) {
			tmp.Defs = append(tmp.Defs, def)
		}
	}
	return &tmp
}

type langRefsCmd struct {
	langCmdCommon
	fileInputArgs
	Coverage bool   `long:"coverage" description:"compute coverage statistics" default:"true"`
	Match    string `short:"m" long:"match" description:"only show refs whose def id contains this substring"`
}

func (c *langRefsCmd) Execute(args []string) error {
	if c.Match != "" && c.Coverage {
		return errors.New("at most one of -m/--match and --coverage may be used")
	}

	return c.forEachLangWithFileInput(context.Background(),
		func(ctx context.Context, langName string, cl lang.LangClient, fi *lang.FileInput) error {
			fileSpans := make([]*lang.RefsOp_FileSpan, len(fi.Origins))
			for i, origin := range fi.Origins {
				// Span entire file (nil span).
				//
				// TODO(sqs): allow calling refs on a subset of the
				// entire file.
				fileSpans[i] = &lang.RefsOp_FileSpan{File: origin}
			}

			refs, err := cl.Refs(ctx, &lang.RefsOp{
				Sources: fi.Sources,
				Origins: fileSpans,
			})
			if err != nil {
				return fmt.Errorf("invoking refs for lang %s: %s", langName, err)
			}

			refs = filterRefs(refs, c.Match)

			switch c.Format {
			case "text":
				w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
				for filename, refs := range refs.Files {
					for _, ref := range refs.Refs {
						fmt.Fprintf(w, "%s:%d:%d\t", filename, ref.Span.StartLine, ref.Span.StartCol)

						if t := ref.Target; t != nil {
							fmt.Fprint(w, t.Id, "\t")

							if t.Fuzzy {
								fmt.Fprint(w, "?") // fuzzy
							} else {
								fmt.Fprint(w, "=") // exact
							}
							fmt.Fprint(w, "\t")

							if t.File != "" {
								fmt.Fprint(w, t.File)
							}
							if t.Span != nil {
								fmt.Fprintf(w, ":%d:%d", t.Span.StartLine, t.Span.StartCol)
							}
							if t.File != "" || t.Span != nil {
								fmt.Fprint(w, " ")
							}

							if len(t.Constraints) != 0 {
								for i, kv := range sortMeta(t.Constraints) {
									if i != 0 {
										fmt.Fprint(w, " ")
									}
									fmt.Fprintf(w, "%s=%s", quoteIfNeeded(kv[0]), quoteIfNeeded(kv[1]))
								}
							}
							fmt.Fprint(w, "\n")
						}
					}
				}
				if err := w.Flush(); err != nil {
					return err
				}
			case "json":
				data, err := json.MarshalIndent(refs, "", "  ")
				if err != nil {
					return err
				}
				fmt.Println(string(data))
			}

			if c.Coverage {
				// To know how we'll we're doing on a file, we must
				// tokenize it to know all of the possible tokens that
				// *could* be refs.
				//
				// TODO(sqs): add another step to coverage to actually
				// fetch the def from a server to see if it resolves
				// online to an existing def.

				type stats struct {
					toks  int // tokens that *should* have refs
					refs  int // number of refs that correspond to a token
					exact int // number of exact (non-fuzzy) refs that correspond to a token

					invalid int // number of refs that don't match a token (could be misaligned)
				}

				w := tabwriter.NewWriter(os.Stderr, 0, 4, 2, ' ', 0)
				printStats := func(filename string, stats *stats) {
					fmt.Fprint(w, "# ", filename, "\t")
					fmt.Fprintf(w, "%d toks\t", stats.toks)
					fmt.Fprintf(w, "%.1f%% ref\t", 100*float64(stats.refs)/float64(stats.toks))
					fmt.Fprintf(w, "%.1f%% exact-ref\t", 100*float64(stats.exact)/float64(stats.toks))
					fmt.Fprintf(w, "%d invalid-ref\t", stats.invalid)
					fmt.Fprint(w, "\n")
				}

				var overall stats
				for filename, data := range refs.Files {
					// List all tokens and filter to only those that
					// *should* be refs.
					allToks, err := cl.Toks(ctx, &lang.ToksOp{Source: fi.Sources[filename]})
					if err != nil {
						return fmt.Errorf("while computing ref stats, tokenizing %s: %s", filename, err)
					}
					var toks []*lang.Tok
					for _, tok := range allToks.Toks {
						if tok.Type == lang.Tok_NAME || strings.HasPrefix(tok.Type.String(), "NAME_") {
							toks = append(toks, tok)
						}
					}

					// See which toks don't have a corresponding ref, and vice versa.
					type span struct{ startByte, byteLen uint32 }
					tokAt := make(map[span]*lang.Tok, len(toks))
					for _, tok := range toks {
						tokAt[span{tok.StartByte, tok.ByteLen}] = tok
					}
					var validRefs, invalidRefs []*lang.Ref
					for _, ref := range data.Refs {
						refSpan := span{ref.Span.StartByte, ref.Span.ByteLen}
						_, present := tokAt[refSpan]
						if present {
							validRefs = append(validRefs, ref)
						} else {
							invalidRefs = append(invalidRefs, ref)
						}
					}
					// Now vice-versa. We can't just delete entries
					// from tokAt as we go, since multiple refs can
					// have the same span, and when processing the 2nd
					// and subsequent such refs, we'd already have
					// deleted their tok.
					refAt := make(map[span]struct{}, len(data.Refs))
					for _, ref := range data.Refs {
						refAt[span{ref.Span.StartByte, ref.Span.ByteLen}] = struct{}{}
					}
					var toksWithNoRefs []*lang.Tok
					for _, tok := range toks {
						if _, present := refAt[span{tok.StartByte, tok.ByteLen}]; !present {
							toksWithNoRefs = append(toksWithNoRefs, tok)
						}
					}

					// Print detailed information about coverage issues.
					for _, tok := range toksWithNoRefs {
						d, err := safeGetRange(fi.Sources[filename], tok.StartByte, tok.ByteLen)
						if err != nil {
							return err
						}
						fmt.Fprintf(w, "# %s:@%d: no ref for token %s: %s\n", filename, tok.StartByte, tok.Type.String(), formatSource(d, 30))
					}
					for _, ref := range invalidRefs {
						d, err := safeGetRange(fi.Sources[filename], ref.Span.StartByte, ref.Span.ByteLen)
						if err != nil {
							return err
						}
						fmt.Fprintf(w, "# %s:%d:%d: no token for ref to %v: %s\n", filename, ref.Span.StartLine, ref.Span.StartCol, ref.Target, formatSource(d, 30))
					}

					stats := stats{
						toks:    len(toks),
						refs:    len(validRefs),
						invalid: len(invalidRefs),
					}
					for _, ref := range validRefs {
						if ref.Target != nil && !ref.Target.Fuzzy {
							stats.exact++
						}
					}

					overall.toks += stats.toks
					overall.refs += stats.refs
					overall.exact += stats.exact
					overall.invalid += stats.invalid
					printStats(filename, &stats)
				}

				if len(refs.Files) > 1 {
					// Only overall stats if there's more than 1 file.
					printStats("OVERALL", &overall)
				}
				if err := w.Flush(); err != nil {
					return err
				}
			}

			if !refs.Complete {
				fmt.Fprintln(os.Stderr, "# INCOMPLETE")
			}
			if len(refs.Messages) > 0 {
				fmt.Fprintln(os.Stderr, "# Log messages from server:")
				for _, msg := range refs.Messages {
					fmt.Fprintln(os.Stderr, "#   ", msg)
				}
			}

			return nil
		},
	)
}

func filterRefs(refs *lang.RefsResult, match string) *lang.RefsResult {
	if match == "" {
		return refs
	}
	tmp := *refs
	tmp.Files = make(map[string]*lang.Refs, len(refs.Files))
	for file, refs := range refs.Files {
		if _, present := tmp.Files[file]; !present {
			tmp.Files[file] = &lang.Refs{}
		}
		for _, ref := range refs.Refs {
			if ref.Target != nil && strings.Contains(ref.Target.Id, match) {
				tmp.Files[file].Refs = append(tmp.Files[file].Refs, ref)
			}
		}
	}
	return &tmp
}

type langToksCmd struct {
	langCmdCommon
	Stats bool `long:"stats" description:"print statistics" default:"true"`
	Args  struct {
		File string `positional-arg-name:"FILE"`
	} `positional-args:"yes"`
}

func (c *langToksCmd) Execute(args []string) error {
	data, err := ioutil.ReadFile(c.Args.File)
	if err != nil {
		return err
	}

	ctx := context.Background()

	for _, matchedLang := range filelang.Langs.ByFilename(filepath.Base(c.Args.File)) {
		cl, err := lang.ClientForLang(matchedLang.Name)
		if err != nil {
			return err
		}

		toks, err := cl.Toks(ctx, &lang.ToksOp{Source: data})
		if err != nil {
			return err
		}

		switch c.Format {
		case "text":
			w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
			for _, tok := range toks.Toks {
				fmt.Fprintf(w, "@%d\t", tok.StartByte)
				fmt.Fprint(w, tok.Type, "\t")

				d, err := safeGetRange(data, tok.StartByte, tok.ByteLen)
				if err != nil {
					return err
				}

				fmt.Fprint(w, formatSource(d, 100))
				fmt.Fprintln(w)
			}
			if err := w.Flush(); err != nil {
				return err
			}
		case "json":
			data, err := json.MarshalIndent(toks, "", "  ")
			if err != nil {
				return err
			}
			fmt.Println(string(data))
		}

		if c.Stats {
			fmt.Fprintf(os.Stderr, "# %d toks\n", len(toks.Toks))
		}

		if !toks.Complete {
			fmt.Fprintln(os.Stderr, "# INCOMPLETE")
		}
		if len(toks.Messages) > 0 {
			fmt.Fprintln(os.Stderr, "# Log messages from server:")
			for _, msg := range toks.Messages {
				fmt.Fprintln(os.Stderr, "#   ", msg)
			}
		}
	}

	return nil
}

func safeGetRange(data []byte, startByte, byteLen uint32) ([]byte, error) {
	if int(startByte) >= len(data) {
		return nil, fmt.Errorf("token start byte %d exceeds file bounds (%d bytes total)", startByte, len(data))
	}
	if int(byteLen) > len(data)-int(startByte) {
		return nil, fmt.Errorf("token starting at byte %d of length %d exceeds file bounds (%d bytes total)", startByte, byteLen, len(data))
	}
	return data[startByte : startByte+byteLen], nil
}

// formatSource formats a source code snippet. The maxLength parameter is a rough guideline.
func formatSource(b []byte, approxMaxLength int) string {
	if len(b) <= approxMaxLength {
		return strconv.Quote(string(b))
	}
	return fmt.Sprintf("%s (truncated; %d more bytes)",
		strconv.Quote(string(b[:approxMaxLength])+"…"),
		len(b)-approxMaxLength,
	)
}

func sortMeta(m map[string]string) [][2]string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	kvs := make([][2]string, len(keys))
	for i, k := range keys {
		kvs[i] = [2]string{k, m[k]}
	}
	return kvs
}

func quoteIfNeeded(s string) string {
	q := strconv.Quote(s)
	if q[1:len(q)-1] != s {
		return q
	}
	return s
}

func sortStringMapKeys(m interface{} /* map[string]T */) []string {
	keysV := reflect.ValueOf(m).MapKeys()
	keys := make([]string, len(keysV))
	for i, keyV := range keysV {
		if keyV.Kind() != reflect.String {
			panic("map key is not string")
		}
		keys[i] = keyV.String()
	}
	sort.Strings(keys)
	return keys
}
