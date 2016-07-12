// +build ignore

// This is a quick refs pass, but it is not very accurate since it
// only parses (no typechecking).

package golang

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"path"
	"sync"

	"golang.org/x/net/context"

	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

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
	populateUniverse()

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
		_, err := ast.NewPackage(fset, fileMap, nil, universe)
		if err != nil {
			hasErrors = true
			res.Messages = append(res.Messages, err.Error())
		}
	}

	for _, origin := range op.Origins {
		file := origins[origin.File]
		if file == nil {
			hasErrors = true
			res.Messages = append(res.Messages, fmt.Sprintf("origin file not parsed (check for parse error and file existence): %s", origin))
			continue
		}
		refs, err := indexFileRefs(fset, file)
		if err != nil {
			hasErrors = true
			res.Messages = append(res.Messages, err.Error())
			continue
		}
		res.Files[origin.File] = &lang.Refs{Refs: refs}
	}

	res.Complete = !hasErrors
	return res, nil
}

func indexFileRefs(fset *token.FileSet, file *ast.File) ([]*lang.Ref, error) {
	v := refVisitor{
		fset:    fset,
		pkgName: file.Name.Name,
		skip:    map[ast.Node]struct{}{},
	}
	ast.Walk(&v, file)
	return v.refs, nil
}

type refVisitor struct {
	fset    *token.FileSet
	pkgName string
	defs    []*lang.Def
	refs    []*lang.Ref

	skip map[ast.Node]struct{}
}

// Visit implements the ast.Visitor interface.
func (v *refVisitor) Visit(node ast.Node) ast.Visitor {
	if _, skip := v.skip[node]; skip {
		return nil
	}

	switch n := node.(type) {
	case *ast.SelectorExpr:
		// Use both parts of the SelectorExpr as search context if we need to
		// fall back to fuzzy search.
		ref := &lang.Ref{
			Span:   makeNodeSpan(v.fset, n.Sel),
			Target: resolveIdent(v.fset, n.Sel, v.pkgName),
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
				if ref.Target.Constraints == nil {
					ref.Target.Constraints = map[string]string{}
				}
				addGoPackageNameMeta(ref.Target.Constraints, x.Name)
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
			Span:   makeNodeSpan(v.fset, n),
			Target: resolveIdent(v.fset, n, v.pkgName),
		}

		v.refs = append(v.refs, ref)
	}
	return v
}

func resolveIdent(fset *token.FileSet, n *ast.Ident, pkgName string) (t *lang.Target) {
	t = &lang.Target{Id: n.Name}

	// TODO(sqs): handle imported package names, like "http" for
	// "net/http".

	if n.Obj != nil && n.Obj.Decl != nil {
		if decl, ok := n.Obj.Decl.(ast.Node); ok {
			t.Span = makeNodeSpan(fset, decl)
			t.File = fset.Position(decl.Pos()).Filename
		}
	}
	if !n.IsExported() && t.Span == nil && t.File == "" {
		t.Fuzzy = true
		
		// Unexported def must be in this package.

		if t.Constraints == nil {
			t.Constraints = map[string]string{}
		}

		// TODO(sqs): need a way to get the import path here to apply
		// this constraint.
		//
		// addGoPackageImportPathMeta(meta map[string]string, pkgImportPath string)

		// Also apply package name constraint for dirs with multiple
		// packages in them (e.g., package main, xyz, xyz_test, etc.).
		addGoPackageNameMeta(t.Constraints, pkgName)
	}
	return t
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
