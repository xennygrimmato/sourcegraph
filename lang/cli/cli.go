package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
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

		_, err = g.AddCommand("sel",
			"print selection information",
			"The sel subcommand reports type/target/etc. information about a position in a file.",
			&langSelCmd{},
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
	Format string   `short:"f" long:"format" description:"output format" choice:"text" choice:"json" default:"text" required:"yes"`
	Config []string `short:"O" long:"opt" description:"set lang server-specific config (can be used multiple times)" value-name:"KEY=VALUE"`
}

func (c *langCmdCommon) configMap() (map[string]string, error) {
	m := make(map[string]string, len(c.Config))
	for _, kv := range c.Config {
		parts := strings.SplitN(kv, "=", 2)
		key := parts[0]
		var val string
		if len(parts) == 2 {
			val = parts[1]
		}
		if _, present := m[key]; present {
			return nil, fmt.Errorf("--opt/-O config: key %q may be specified at most once", key)
		}
		m[key] = val
	}
	return m, nil
}

type sourcesArgs struct {
	Args struct {
		SourceDir string `positional-arg-name:"SOURCE-DIR"`
	} `positional-args:"yes" required:"1"`
}

func (a sourcesArgs) listFilesByLang(ctx context.Context) (map[string]map[string][]byte, error) {
	if fi, err := os.Stat(a.Args.SourceDir); err != nil {
		return nil, fmt.Errorf("stat %s: %s", a.Args.SourceDir, err)
	} else if !fi.Mode().IsDir() {
		return nil, fmt.Errorf("not a directory: %s", a.Args.SourceDir)
	}

	byLang, err := lang.SourceFilesByLang(ctx, vfsutil.Walkable(vfs.OS(a.Args.SourceDir), filepath.Join))
	if err != nil {
		return nil, fmt.Errorf("finding source files for %s: %s", a.Args.SourceDir, err)
	}
	return byLang, nil
}

func (a sourcesArgs) forEachLangWithSources(ctx context.Context, f func(ctx context.Context, langName string, cl lang.LangClient, sources map[string][]byte) error) error {
	byLang, err := a.listFilesByLang(ctx)
	if err != nil {
		return err
	}

	for langName, sources := range byLang {
		cl, err := lang.ClientForLang(langName)
		if err != nil {
			return err
		}
		if err := f(ctx, langName, cl, sources); err != nil {
			return err
		}
	}
	return nil
}

func filesInSources(sources map[string][]byte, filenames ...string) ([]string, error) {
	if len(filenames) == 0 {
		filenames = make([]string, 0, len(sources))
		for filename := range sources {
			filenames = append(filenames, filename)
		}
		return filenames, nil
	}

	for _, filename := range filenames {
		if _, present := sources[filename]; !present {
			return nil, fmt.Errorf("origin %q not present in sources", filename)
		}
	}

	return filenames, nil
}

type langDefsCmd struct {
	langCmdCommon
	sourcesArgs
	Origins []string `short:"o" long:"origin" description:"return defs defined in these files (default: all sources)"`
	Stats   bool     `long:"stats" description:"print statistics" default:"true"`
	Match   string   `short:"m" long:"match" description:"only show defs containing this substring"`
}

func (c *langDefsCmd) Execute(args []string) error {
	config, err := c.configMap()
	if err != nil {
		return err
	}

	return c.forEachLangWithSources(context.Background(),
		func(ctx context.Context, langName string, cl lang.LangClient, sources map[string][]byte) error {
			origins, err := filesInSources(sources, c.Origins...)
			if err != nil {
				return err
			}

			defs, err := cl.Defs(ctx, &lang.DefsOp{
				Sources: sources,
				Origins: origins,
				Config:  config,
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
	sourcesArgs
	Origins  []string `short:"o" long:"origin" description:"return defs defined in these files (default: all sources)"`
	Coverage bool     `long:"coverage" description:"compute coverage statistics" default:"true"`
	Match    string   `short:"m" long:"match" description:"only show refs whose def id contains this substring"`
}

func (c *langRefsCmd) Execute(args []string) error {
	config, err := c.configMap()
	if err != nil {
		return err
	}

	if c.Match != "" && c.Coverage {
		return errors.New("at most one of -m/--match and --coverage may be used")
	}

	return c.forEachLangWithSources(context.Background(),
		func(ctx context.Context, langName string, cl lang.LangClient, sources map[string][]byte) error {
			origins, err := filesInSources(sources, c.Origins...)
			if err != nil {
				return err
			}

			fileSpans := make([]*lang.RefsOp_FileSpan, len(origins))
			for i, origin := range origins {
				// Span entire file (nil span).
				//
				// TODO(sqs): allow calling refs on a subset of the
				// entire file.
				fileSpans[i] = &lang.RefsOp_FileSpan{File: origin}
			}

			refs, err := cl.Refs(ctx, &lang.RefsOp{
				Sources: sources,
				Origins: fileSpans,
				Config:  config,
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
						printTarget(w, ref.Target)
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
					allToks, err := cl.Toks(ctx, &lang.ToksOp{Source: sources[filename]})
					if err != nil {
						return fmt.Errorf("while computing ref stats, tokenizing %s: %s", filename, err)
					}
					var toks []*lang.Tok
					for _, tok := range allToks.Toks {
						if tok.Type >= lang.Tok_NAME && tok.Type <= lang.Tok_NAME_END {
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
						d, err := safeGetRange(sources[filename], tok.StartByte, tok.ByteLen)
						if err != nil {
							return err
						}
						fmt.Fprintf(w, "# %s:@%d: no ref for token %s: %s\n", filename, tok.StartByte, tok.Type.String(), formatSource(d, 30))
					}
					for _, ref := range invalidRefs {
						d, err := safeGetRange(sources[filename], ref.Span.StartByte, ref.Span.ByteLen)
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
	config, err := c.configMap()
	if err != nil {
		return err
	}

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

		toks, err := cl.Toks(ctx, &lang.ToksOp{
			Source: data,
			Config: config,
		})
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

type langSelCmd struct {
	langCmdCommon
	sourcesArgs
	Args struct {
		Origin    string `required:"yes" positional-arg-name:"FILE"`
		StartByte uint32 `required:"yes" positional-arg-name:"OFFSET"`
	} `positional-args:"yes" required:"yes"`
}

func (c *langSelCmd) Execute(args []string) error {
	config, err := c.configMap()
	if err != nil {
		return err
	}

	return c.forEachLangWithSources(context.Background(),
		func(ctx context.Context, langName string, cl lang.LangClient, sources map[string][]byte) error {
			origins, err := filesInSources(sources, c.Args.Origin)
			if err != nil {
				return err
			}

			sel, err := cl.Sel(ctx, &lang.SelOp{
				Sources: sources,
				Origin:  origins[0],
				Span:    &lang.Span{StartByte: c.Args.StartByte, ByteLen: 0},
				Config:  config,
			})
			if err != nil {
				return fmt.Errorf("invoking sel for lang %s: %s", langName, err)
			}

			switch c.Format {
			case "text":
				fmt.Fprintln(os.Stdout, "TARGETS")
				if len(sel.Defs) > 0 {
					w := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
					for _, t := range sel.Defs {
						printTarget(w, t)
					}
					if err := w.Flush(); err != nil {
						return err
					}
				} else {
					fmt.Fprintln(os.Stdout, "(no target defs returned)")
				}

				fmt.Fprintln(os.Stdout)
				fmt.Fprintln(os.Stdout, "TYPE")
				if sel.TypeString != "" {
					fmt.Fprintln(os.Stdout, sel.TypeString)
				} else {
					fmt.Fprintln(os.Stdout, "(no type string provided)")
				}
			case "json":
				data, err := json.MarshalIndent(sel, "", "  ")
				if err != nil {
					return err
				}
				fmt.Println(string(data))
			}

			if !sel.Complete {
				fmt.Fprintln(os.Stderr, "# INCOMPLETE")
			}
			if len(sel.Messages) > 0 {
				fmt.Fprintln(os.Stderr, "# Log messages from server:")
				for _, msg := range sel.Messages {
					fmt.Fprintln(os.Stderr, "#   ", msg)
				}
			}

			return nil
		},
	)
}

func printTarget(w io.Writer, t *lang.Target) {
	if t == nil {
		fmt.Fprintln(w, "(no target)")
	} else {
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
