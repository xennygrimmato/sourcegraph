package golang

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"path"

	"golang.org/x/net/context"

	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

// TODO(sqs): use golang.org/x/tools/go/buildutil OverlayContext? Says
// only Context.OpenFile respects it right now, so maybe hold off.
//
// TODO(sqs): parallelize
//
// TODO(sqs): DefsOp probably needs to have a "Go import path"
// parameter.
func (s *langServer) Defs(ctx context.Context, op *lang.DefsOp) (*lang.DefsResult, error) {
	hasErrors := false
	res := &lang.DefsResult{}

	isOrigin := func(name string) bool {
		for _, origin := range op.Origins {
			if origin == name {
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
	fset := token.NewFileSet()
	for _, filename := range sortSources(op.Sources) {
		file, err := parser.ParseFile(fset, filename, op.Sources[filename], parser.ParseComments)
		if err != nil {
			hasErrors = true
			res.Messages = append(res.Messages, err.Error())
		}
		if file != nil {
			key := pkgKey{dir: path.Dir(filename), name: file.Name.Name}
			pkgFiles[key] = append(pkgFiles[key], file)
			if isOrigin(filename) {
				origins[filename] = file
			}
		}
	}

	for _, files := range pkgFiles {
		fileMap := make(map[string]*ast.File, len(files))
		for _, f := range files {
			fileMap[fset.Position(f.Package).Filename] = f
		}

		// Call ast.NewPackage for side effects of resolving
		// identifiers across files and packages.
		_, err := ast.NewPackage(fset, fileMap, nil, nil)
		if err != nil {
			hasErrors = true
			res.Messages = append(res.Messages, err.Error())
		}
	}

	for _, origin := range op.Origins {
		file := origins[origin]
		if file == nil {
			hasErrors = true
			res.Messages = append(res.Messages, fmt.Sprintf("origin file not parsed (check for parse error and file existence): %s", origin))
			continue
		}
		defs, err := indexFileDefs(fset, file)
		if err != nil {
			hasErrors = true
			res.Messages = append(res.Messages, err.Error())
			continue
		}
		for _, def := range defs {
			if def.Meta == nil {
				def.Meta = map[string]string{}
			}
			addGoPackageNameMeta(def.Meta, file.Name.Name)
		}
		res.Defs = append(res.Defs, defs...)
	}

	res.Complete = !hasErrors
	return res, nil
}

func indexFileDefs(fset *token.FileSet, file *ast.File) ([]*lang.Def, error) {
	v := defVisitor{
		fset: fset,
		skip: map[ast.Node]struct{}{},
	}
	ast.Walk(&v, file)
	return v.defs, nil
}

type defVisitor struct {
	fset *token.FileSet
	defs []*lang.Def

	skip map[ast.Node]struct{}
}

// Visit implements the ast.DefVisitor interface.
func (v *defVisitor) Visit(node ast.Node) ast.Visitor {
	if _, skip := v.skip[node]; skip {
		return nil
	}

	switch n := node.(type) {
	case *ast.FuncDecl:
		v.defs = append(v.defs, &lang.Def{
			Id: n.Name.Name,
			Title: astString(v.fset, &ast.FuncDecl{
				// avoid including full docs and body in def Title
				Recv: n.Recv,
				Name: n.Name,
				Type: n.Type,
			}),
			Path:     v.fset.Position(n.Pos()).Filename,
			Span:     makeNodeSpan(v.fset, n),
			NameSpan: makeNodeSpan(v.fset, n.Name),
		})

		// Don't emit a ref for the def name (it would be redundant).
		v.skip[n.Name] = struct{}{}
	}
	return v
}

var astPrinter = &printer.Config{Mode: printer.RawFormat}

func astString(fset *token.FileSet, n ast.Node) string {
	var buf bytes.Buffer
	if err := astPrinter.Fprint(&buf, fset, n); err != nil {
		panic(err)
	}
	return buf.String()
}
