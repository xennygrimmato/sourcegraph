package golang

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"go/types"
	"path"
	"sort"
	"sync"

	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

// TODO(sqs): use golang.org/x/tools/go/buildutil OverlayContext? Says
// only Context.OpenFile respects it right now, so maybe hold off.
//
// TODO(sqs): parallelize
//
// TODO(sqs): support go/ast.Importer for better cross-package
// results; IndexOp probably needs to have a "Go import path"
// parameter.
//
// TODO(sqs): use godefinfo to get better results
func index(op *lang.IndexOp) (*lang.IndexResult, error) {
	populateUniverse()

	hasErrors := false
	res := &lang.IndexResult{Files: make(map[string]*lang.IndexResult_IndexData, len(op.Targets))}

	isTarget := func(name string) bool {
		for _, target := range op.Targets {
			if target == name {
				return true
			}
		}
		return false
	}

	type pkgKey struct {
		dir, name string
	}
	pkgFiles := map[pkgKey][]*ast.File{}
	targets := make(map[string]*ast.File, len(op.Targets))
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
			if isTarget(filename) {
				targets[filename] = file
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
		_, err := ast.NewPackage(fset, fileMap, nil, universe)
		if err != nil {
			hasErrors = true
			res.Messages = append(res.Messages, err.Error())
		}
	}

	for _, target := range op.Targets {
		file := targets[target]
		if file == nil {
			hasErrors = true
			res.Messages = append(res.Messages, fmt.Sprintf("target file not parsed (check for parse error and file existence): %s", target))
			continue
		}
		fres, err := indexFile(fset, file)
		if err != nil {
			hasErrors = true
			res.Messages = append(res.Messages, err.Error())
			continue
		}
		if fres != nil {
			res.Files[target] = fres
		}
	}

	res.Complete = !hasErrors
	return res, nil
}

func indexFile(fset *token.FileSet, file *ast.File) (*lang.IndexResult_IndexData, error) {
	v := visitor{
		fset: fset,
		skip: map[ast.Node]struct{}{},
	}
	ast.Walk(&v, file)
	return &lang.IndexResult_IndexData{
		Defs: v.defs,
		Refs: v.refs,
	}, nil
}

// sortSources sorts IndexOp.Sources files (the map keys) for
// determinism.
func sortSources(sources map[string][]byte) []string {
	names := make([]string, 0, len(sources))
	for name := range sources {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

type visitor struct {
	fset *token.FileSet
	defs []*lang.Def
	refs []*lang.Ref

	skip map[ast.Node]struct{}
}

// Visit implements the ast.Visitor interface.
func (v *visitor) Visit(node ast.Node) ast.Visitor {
	if _, skip := v.skip[node]; skip {
		return nil
	}

	switch n := node.(type) {
	case *ast.FuncDecl:
		v.defs = append(v.defs, &lang.Def{
			Ident: n.Name.Name,
			Title: astString(v.fset, &ast.FuncDecl{
				// avoid including full docs and body in def Title
				Recv: n.Recv,
				Name: n.Name,
				Type: n.Type,
			}),
			Kind:     "func",
			Global:   n.Name.IsExported(),
			Span:     makeSpan(v.fset, n),
			NameSpan: makeSpan(v.fset, n.Name),
		})

		// Don't emit a ref for the def name (it would be redundant).
		v.skip[n.Name] = struct{}{}

	case *ast.SelectorExpr:
		// Use both parts of the SelectorExpr as search context if we need to
		// fall back to fuzzy search.
		ref := &lang.Ref{
			Span:   makeSpan(v.fset, n.Sel),
			Target: resolveIdent(v.fset, n.Sel),
		}
		if x, ok := n.X.(*ast.Ident); ok {
			// If x.Obj.Decl is set, then x likely refers to a local
			// variable; adding the local var's name to the search
			// context won't help.
			if o := x.Obj; o == nil || o.Decl == nil {
				// TODO(sqs): can do a better job here, such as knowing that
				// "http.NewRequest" http is net/http, getting local var
				// types, etc.
				if ref.Target == nil {
					ref.Target = &lang.Target{}
				}
				ref.Target.Context = x.Name
			}
		}

		v.refs = append(v.refs, ref)

		// Don't double-walk the SelectorExpr's Ident.
		v.skip[n.Sel] = struct{}{}

	case *ast.Ident:
		// TODO(sqs): walk *ast.SelectorExprs so we can know
		// additional context about exprs like "http.NewRequest"
		// (here, we can only see "NewRequest", which gives us less
		// context for fuzzy ref lookups).

		ref := &lang.Ref{
			Span:   makeSpan(v.fset, n),
			Target: resolveIdent(v.fset, n),
		}

		v.refs = append(v.refs, ref)
	}
	return v
}

func resolveIdent(fset *token.FileSet, n *ast.Ident) (t *lang.Target) {
	if n.Obj != nil && n.Obj.Decl != nil {
		if decl, ok := n.Obj.Decl.(ast.Node); ok {
			if t == nil {
				t = &lang.Target{}
			}
			t.Exact = true
			t.Span = makeSpan(fset, decl)
			t.Path = fset.Position(decl.Pos()).Filename
		}
	}
	if !n.IsExported() && (t == nil || t.Path == "") {
		if t == nil {
			t = &lang.Target{}
		}
		// Unexported def must be in this dir.
		t.Path = path.Dir(fset.Position(n.Pos()).Filename)
	}
	return t
}

func makeSpan(fset *token.FileSet, n ast.Node) *lang.Span {
	start := fset.Position(n.Pos())
	end := fset.Position(n.End())

	startLine := start.Line
	endLine := end.Line
	if startLine == endLine {
		endLine = 0
	}

	return &lang.Span{
		StartByte: uint32(start.Offset),
		ByteLen:   uint32(end.Offset - start.Offset),
		StartLine: uint32(startLine),
		StartCol:  uint32(start.Column),
		EndLine:   uint32(endLine),
		EndCol:    uint32(end.Column),
	}
}

var astPrinter = &printer.Config{Mode: printer.RawFormat}

func astString(fset *token.FileSet, n ast.Node) string {
	var buf bytes.Buffer
	if err := astPrinter.Fprint(&buf, fset, n); err != nil {
		panic(err)
	}
	return buf.String()
}

var (
	universeMu sync.Mutex
	universe   *ast.Scope
)

func populateUniverse() {
	// Can't do this in a `func init()` because types.Universe itself
	// is populated in a `func init()`, and we can't guarantee it runs
	// beforehand.
	//
	// TODO(sqs): This doesn't seem to be working. The ast.NewPackage
	// call still returns errors like "20:16: undeclared name: string
	// (and 46 more errors)".

	universeMu.Lock()
	if universe != nil {
		universeMu.Unlock()
		return
	}

	universe = ast.NewScope(nil)
	for _, name := range types.Universe.Names() {
		astObj := &ast.Object{Name: name}

		typObj := types.Universe.Lookup(name)
		switch o := typObj.(type) {
		case *types.TypeName:
			astObj.Kind = ast.Typ
			astObj.Decl = &ast.TypeSpec{Name: &ast.Ident{Name: name, NamePos: o.Pos()}}
		}
		universe.Insert(astObj)
	}

	universeMu.Unlock()
}
