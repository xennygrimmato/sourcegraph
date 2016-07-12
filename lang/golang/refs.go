package golang

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"path"
	"strings"

	"golang.org/x/net/context"
	"golang.org/x/tools/go/buildutil"
	"golang.org/x/tools/go/loader"

	"sourcegraph.com/sourcegraph/sourcegraph/lang"
	"sourcegraph.com/sourcegraph/sourcegraph/lang/golang/refinfo"
)

const _TMP_dir = "/home/sqs/src/github.com/gorilla/mux/"

// TODO(sqs): use golang.org/x/tools/go/buildutil OverlayContext? Says
// only Context.OpenFile respects it right now, so maybe hold off.
//
// TODO(sqs): parallelize
//
// TODO(sqs): support go/ast.Importer for better cross-package
// results; DefsOp probably needs to have a "Go import path"
// parameter.
//
// TODO(sqs): use godefinfo to get better results
func (s *langServer) Refs(ctx context.Context, op *lang.RefsOp) (*lang.RefsResult, error) {
	const _TMP_importPath = "github.com/gorilla/mux"
	m := map[string]map[string]string{_TMP_importPath: map[string]string{}}
	for filename, data := range op.Sources {
		m[_TMP_importPath][filename] = string(data)
	}
	m["net/http"] = map[string]string{"x.go": "package http; func NewRequest() {}"}
	bctx := buildutil.FakeContext(m)
	bctx = &dummyBuildContext

	fset := token.NewFileSet()

	cfg := refinfo.Config{
		Build:    bctx,
		Fset:     fset,
		Importer: newImporter(fset, bctx),
	}
	cacheForParseFile := map[string]*ast.File{}
	cfg.ParseFile = func(dir, filename string) (*ast.File, error) {
		key := path.Join(dir, filename)
		if f, present := cacheForParseFile[key]; present {
			return f, nil
		}

		displayPath := func(path string) string {
			return strings.TrimPrefix(path, _TMP_dir)
		}
		f, err := buildutil.ParseFile(cfg.Fset, cfg.Build, displayPath, _TMP_dir, filename, 0)
		if f != nil {
			cacheForParseFile[key] = f
		}
		return f, err
	}
	cacheForCreateFromFilesAndLoad := map[string]*loader.Program{}
	cfg.CreateFromFilesAndLoad = func(dir, importPath string, astFiles ...*ast.File) (prog *loader.Program, msgs []string, err error) {
		if prog, present := cacheForCreateFromFilesAndLoad[importPath]; present {
			return prog, nil, nil
		}

		// If we're here, then the pure AST-based approach was
		// unsuccessful. Perform a full type analysis of the program.
		conf := loader.Config{
			Fset: cfg.Fset,
			TypeChecker: types.Config{
				Importer:                 cfg.Importer,
				FakeImportC:              true,
				DisableUnusedImportCheck: true,
				Error: func(err error) {
					msgs = append(msgs, "typecheck: "+err.Error())
				},
			},
			TypeCheckFuncBodies: func(path string) bool { return path == importPath },
			Build:               cfg.Build,
			Cwd:                 dir,
			AllowErrors:         true,
		}
		conf.CreateFromFiles(importPath, astFiles...)
		prog, err = conf.Load()
		if prog != nil {
			cacheForCreateFromFilesAndLoad[importPath] = prog
		}
		return
	}

	hasErrors := false
	res := &lang.RefsResult{Files: make(map[string]*lang.Refs, len(op.Origins))}

	isOrigin := func(name string) bool {
		for _, origin := range op.Origins {
			if origin.File == name {
				return true
			}
		}
		return false
	}

	type pkgKey struct {
		dir, name string
	}
	pkgFiles := map[pkgKey][]*ast.File{}
	origins := make(map[string]*ast.File, len(op.Origins))
	pkgsWithOrigin := map[pkgKey]struct{}{}
	for _, filename := range sortSources(op.Sources) {
		file, err := parser.ParseFile(fset, filename, op.Sources[filename], 0)
		if err != nil {
			hasErrors = true
			res.Messages = append(res.Messages, err.Error())
		}
		if file != nil {
			key := pkgKey{dir: path.Dir(filename), name: file.Name.Name}
			pkgFiles[key] = append(pkgFiles[key], file)
			if isOrigin(filename) {
				origins[filename] = file
				pkgsWithOrigin[key] = struct{}{}
			}
		}
	}

	for _, origin := range op.Origins {
		file := origins[origin.File]
		if file == nil {
			hasErrors = true
			res.Messages = append(res.Messages, fmt.Sprintf("origin file not parsed (check for parse error and file existence): %s", origin))
			continue
		}

		idents := indexFileRefs(&cfg, file)

		var refs []*lang.Ref
		for _, ident := range idents {
			pos := cfg.Fset.Position(ident.Pos())
			ri, msgs, err := cfg.Get(context.TODO(), pos.Filename, uint32(pos.Offset))
			if err != nil {
				// TODO(sqs): collect these
				ignore := strings.Contains(err.Error(), "no type information") || strings.Contains(err.Error(), "not a package-level")

				hasErrors = true
				// TODO(sqs): suppress duplicate messages in a better way
				if ignore && false {
					// TEMP ignore
				} else if len(res.Messages) > 0 && res.Messages[len(res.Messages)-1] == err.Error() {
					// Duplicate; ignore.
				} else {
					res.Messages = append(res.Messages, err.Error())
				}
				continue
			}
			if ri == nil {
				continue
			}
			// TODO(sqs): collect these
			//
			// res.Messages = append(res.Messages, msgs...)
			_ = msgs

			ref := &lang.Ref{
				Span: makeSpan(cfg.Fset, ident),
			}
			if n2 := ri.Node; n2 != nil {
				pos := cfg.Fset.Position(ri.Node.Pos())
				ref.Target = &lang.Target{
					Id:   ident.Name,
					File: pos.Filename,
					Span: makeSpan(cfg.Fset, n2),
				}
			} else {
				ref.Target = &lang.Target{
					Id: ri.DefName(),
				}
				if ref.Target.Constraints == nil {
					ref.Target.Constraints = map[string]string{}
				}
				addGoPackageImportPathMeta(ref.Target.Constraints, ri.PkgPath)
			}
			refs = append(refs, ref)
		}
		res.Files[origin.File] = &lang.Refs{Refs: refs}
	}

	res.Complete = !hasErrors
	return res, nil
}

func indexFileRefs(cfg *refinfo.Config, file *ast.File) []*ast.Ident {
	v := refVisitor{}
	ast.Walk(&v, file)
	return v.idents
}

type refVisitor struct {
	idents []*ast.Ident
}

// Visit implements the ast.Visitor interface.
func (v *refVisitor) Visit(node ast.Node) ast.Visitor {
	switch n := node.(type) {
	case *ast.Ident:
		if n.Name != "_" {
			v.idents = append(v.idents, n)
		}
	}
	return v
}
