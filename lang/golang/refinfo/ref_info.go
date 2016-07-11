package refinfo

import (
	"context"
	"errors"
	"fmt"
	"go/ast"
	"go/build"
	"go/token"
	"go/types"
	"log"
	"os"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/tools/go/ast/astutil"
	"golang.org/x/tools/go/buildutil"
	"golang.org/x/tools/go/loader"
)

type Config struct {
	Build *build.Context
	Fset  *token.FileSet
}

// TODO(sqs): dummy methods, to be replaced by injectable fields

const _TMP_dir = "/go/src/github.com/gorilla/mux/"

func (c *Config) ParseFile(dir, filename string) (*ast.File, error) {
	displayPath := func(path string) string {
		return strings.TrimPrefix(path, _TMP_dir)
	}
	return buildutil.ParseFile(c.Fset, c.Build, displayPath, _TMP_dir, filename, 0)
}

var dlog = log.New(os.Stderr, "DEBUG: ", 0)

const debug = true

// Adapted from godefinfo.

type RefInfo struct {
	Node    ast.Node
	PkgPath string
	Def1    string
	Def2    string
}

func (v RefInfo) DefName() string {
	if v.Def2 == "" {
		return v.Def1
	}
	return v.Def1 + "." + v.Def2
}

func (c *Config) Get(ctx context.Context, filename string, offset uint32) (*RefInfo, []string, error) {
	t0 := time.Now()
	defer func() {
		//log.Println("TOOK", time.Since(t0))
		_ = t0
	}()

	var msgs []string

	dir := path.Dir(filename)
	dir = _TMP_dir
	filename = path.Base(filename)

	// Shared across all attempts.
	var (
		astFile        *ast.File
		enclosingNodes []ast.Node
		pos            token.Pos
	)

	{
		// First, see if we can determine it from just the AST of this
		// single file.
		var err error
		astFile, err = c.ParseFile(dir, filename)
		if err != nil {
			// This is actually fatal.
			return nil, msgs, err
		}
		pos = c.Fset.File(astFile.Pos()).Pos(int(offset))
		enclosingNodes, _ = astutil.PathEnclosingInterval(astFile, pos, pos)
		ri, err := getFromAST(enclosingNodes)
		if err != nil {
			msgs = append(msgs, err.Error())
		}
		if ri != nil {
			return ri, msgs, nil
		}
	}

	var (
		importPath string
		astFiles   map[string]*ast.File
	)
	{
		// Next, see if we can determine it from just this file's
		// package's AST.
		//
		// TODO(sqs): only parse files in the same package
		bPkg, err := buildutil.ContainingPackage(c.Build, dir, filename)
		if err != nil {
			return nil, nil, err
		}
		importPath = bPkg.ImportPath
		bPkg, err = c.Build.ImportDir(bPkg.Dir, 0) // again, without build.FindOnly
		if err != nil {
			return nil, nil, err
		}

		var files []string
		if strings.HasSuffix(astFile.Name.Name, "_test") {
			files = bPkg.XTestGoFiles
		} else {
			files = bPkg.GoFiles
			if strings.HasSuffix(filename, "_test.go") {
				// TODO(sqs): avoid appending to bPkg.GoFiles directly
				// (create a copy instead) if bPkg is ever reused.
				files = append(files, bPkg.TestGoFiles...)
			}
		}

		astFiles = make(map[string]*ast.File, len(files))
		for _, file := range files {
			var f *ast.File
			if file == filename {
				f = astFile // reuse
			} else {
				f, err = c.ParseFile(dir, file)
				if err != nil {
					return nil, nil, err
				}
			}
			astFiles[file] = f
		}
		// Creating the package mutates the files' ASTs to link up
		// more info. Call ast.NewPackage for these side effects.
		//
		// TODO(sqs): ast.NewPackage modifies the *ast.Files...can
		// introduce a race condition if the *ast.Files are cached.
		//
		// TODO(sqs): provide an importer here to possibly resolve
		// simple dep refs like "http.NewRequest"?
		if _, err := ast.NewPackage(c.Fset, astFiles, nil, nil); err != nil {
			if !strings.Contains(err.Error(), "undeclared name:") {
				msgs = append(msgs, "ast.NewPackage: "+err.Error())
			}
		}

		ri, err := getFromAST(enclosingNodes)
		if err != nil {
			msgs = append(msgs, err.Error())
		}
		if ri != nil {
			return ri, msgs, nil
		}
	}

	{
		// If we're here, then the pure AST-based approach was
		// unsuccessful. Perform a full type analysis of the program.
		conf := loader.Config{
			Fset: c.Fset,
			TypeChecker: types.Config{
				Importer:                 newImporter(c.Fset, c.Build), // TODO(sqs)
				FakeImportC:              true,
				DisableUnusedImportCheck: true,
				Error: func(err error) {
					msgs = append(msgs, "typecheck: "+err.Error())
				},
			},
			TypeCheckFuncBodies: func(path string) bool { return path == importPath },
			Build:               c.Build,
			Cwd:                 dir,
			AllowErrors:         true,
		}
		conf.CreateFromFiles(importPath, astFileSlice(astFiles)...)
		prog, err := conf.Load()
		if err != nil {
			msgs = append(msgs, "conf.Load: "+err.Error())
		}
		if prog != nil {
			for _, pkg := range prog.Created {
				if pkg.Pkg.Path() == importPath {
					ri, err := get(pkg, astFile, pos)
					return ri, msgs, err
				}
			}
		}
	}

	return nil, nil, nil
}

func astFileSlice(m map[string]*ast.File) []*ast.File {
	files := make([]*ast.File, 0, len(m))
	for _, f := range m {
		files = append(files, f)
	}
	return files
}

func getFromAST(nodes []ast.Node) (*RefInfo, error) {
	n := nodes[0]
	if n, ok := n.(*ast.Ident); ok {
		if n.Obj != nil && n.Obj.Decl != nil {
			if decl, ok := n.Obj.Decl.(ast.Node); ok {
				return &RefInfo{Node: decl}, nil
			}
		}
	}
	return nil, nil
}

func get(pkg *loader.PackageInfo, file *ast.File, pos token.Pos) (*RefInfo, error) {
	nodes, _ := pathEnclosingInterval(file, pos, pos)

	// Handle import statements.
	if len(nodes) > 2 {
		if im, ok := nodes[1].(*ast.ImportSpec); ok {
			pkgPath, err := strconv.Unquote(im.Path.Value)
			if err != nil {
				return nil, err
			}
			return &RefInfo{PkgPath: pkgPath}, nil
		}
	}

	var identX *ast.Ident
	var selX *ast.SelectorExpr
	selX, ok := nodes[0].(*ast.SelectorExpr)
	if ok {
		identX = selX.Sel
	} else {
		identX, ok = nodes[0].(*ast.Ident)
		if !ok {
			return nil, errors.New("no identifier found")
		}
		if len(nodes) > 1 {
			selX, _ = nodes[1].(*ast.SelectorExpr)
		}
	}

	if obj := pkg.Info.Defs[identX]; obj != nil {
		switch t := obj.Type().(type) {
		case *types.Signature:
			if t.Recv() == nil {
				// Top-level func.
				return objRefInfo(obj, ""), nil
			}
			// Method or interface method.
			return &RefInfo{
				PkgPath: obj.Pkg().Path(),
				Def1:    dereferenceType(t.Recv().Type()).(*types.Named).Obj().Name(),
				Def2:    identX.Name,
			}, nil
		}

		if obj.Parent() == pkg.Pkg.Scope() {
			// Top-level package def.
			return objRefInfo(obj, ""), nil
		}

		// Struct field.
		if _, ok := nodes[1].(*ast.Field); ok {
			if typ, ok := nodes[4].(*ast.TypeSpec); ok {
				return &RefInfo{
					PkgPath: obj.Pkg().Path(),
					Def1:    typ.Name.Name,
					Def2:    obj.Name(),
				}, nil
			}
		}

		if pkg, name, ok := typeName(dereferenceType(obj.Type())); ok {
			return &RefInfo{PkgPath: pkg, Def1: name}, nil
		}

		return nil, fmt.Errorf("unable to identify def (ident: %v, object: %v)", identX, obj)

	}

	obj := pkg.Info.Uses[identX]
	if obj == nil {
		return nil, fmt.Errorf("no type information for identifier %q at %d", identX.Name, pos)
	}
	if pkgName, ok := obj.(*types.PkgName); ok {
		return &RefInfo{PkgPath: pkgName.Imported().Path()}, nil
	} else if selX == nil {
		if pkg.Pkg.Scope().Lookup(identX.Name) == obj {
			return objRefInfo(obj, ""), nil
		} else if types.Universe.Lookup(identX.Name) == obj {
			return &RefInfo{PkgPath: "builtin", Def1: obj.Name()}, nil
		} else {
			// NOTE(sqs): this old godefinfo code linked to a local
			// var's TYPE not def, which makes sense (kinda) for
			// godefinfo but not for this.
			//
			//t := dereferenceType(obj.Type())
			//if pkg, name, ok := typeName(t); ok {
			//	return &RefInfo{PkgPath: pkg, Def1: name}, nil
			//}
			return nil, fmt.Errorf("not a package-level definition (ident: %v, object: %v) and unable to construct id for local var", identX, obj)
		}
	} else if sel, ok := pkg.Info.Selections[selX]; ok {
		recv, ok := dereferenceType(deepRecvType(sel)).(*types.Named)
		if !ok || recv == nil || recv.Obj() == nil || recv.Obj().Pkg() == nil || recv.Obj().Pkg().Scope().Lookup(recv.Obj().Name()) != recv.Obj() {
			return nil, errors.New("receiver is not a top-level named type")
		}

		obj, _, _ := types.LookupFieldOrMethod(sel.Recv(), true, pkg.Pkg, identX.Name)
		if obj == nil {
			return nil, errors.New("method or field not found")
		}

		ri := objRefInfo(recv.Obj(), "")
		ri.Def2 = identX.Name
		return ri, nil
	} else {
		// Qualified reference (to another package's top-level
		// definition).
		if obj := pkg.Info.Uses[selX.Sel]; obj != nil {
			return objRefInfo(obj, ""), nil
		}
		return nil, errors.New("no selector type")
	}

	return nil, errors.New("no ref info found")
}

// deepRecvType gets the embedded struct's name that the method or
// field is actually defined on, not just the original/outer recv
// type.
func deepRecvType(sel *types.Selection) types.Type {
	var offset int
	offset = 1
	if sel.Kind() == types.MethodVal || sel.Kind() == types.MethodExpr {
		offset = 0
	}

	typ := sel.Recv()
	idx := sel.Index()
	for k, i := range idx[:len(idx)-offset] {
		final := k == len(idx)-offset-1
		t := getMethod(typ, i, final, sel.Kind() != types.FieldVal)
		if t == nil {
			dlog.Printf("failed to get method/field at index %v on recv %s", idx, typ)
			return nil
		}
		typ = t.Type()
	}
	return typ
}

func dereferenceType(typ types.Type) types.Type {
	if typ, ok := typ.(*types.Pointer); ok {
		return typ.Elem()
	}
	return typ
}

func typeName(typ types.Type) (pkg, name string, ok bool) {
	switch typ := typ.(type) {
	case *types.Named:
		if typ.Obj() != nil {
			return "", "", false
		}
		return typ.Obj().Pkg().Path(), typ.Obj().Name(), true
	case *types.Basic:
		return "builtin", typ.Name(), true
	}
	return "", "", false
}

func getMethod(typ types.Type, idx int, final bool, method bool) (obj types.Object) {
	switch obj := typ.(type) {
	case *types.Pointer:
		return getMethod(obj.Elem(), idx, final, method)

	case *types.Named:
		if final && method {
			switch obj2 := dereferenceType(obj.Underlying()).(type) {
			case *types.Interface:
				recvObj := obj2.Method(idx).Type().(*types.Signature).Recv()
				if recvObj.Type() == obj.Underlying() {
					return obj.Obj()
				}
				return recvObj
			}
			return obj.Method(idx).Type().(*types.Signature).Recv()
		}
		return getMethod(obj.Underlying(), idx, final, method)

	case *types.Struct:
		return obj.Field(idx)

	case *types.Interface:
		// Our index is among all methods, but we want to get the
		// interface that defines the method at our index.
		return obj.Method(idx).Type().(*types.Signature).Recv()
	}
	return nil
}

func objRefInfo(obj types.Object, Def2 string) *RefInfo {
	if obj.Pkg() != nil {
		return &RefInfo{PkgPath: obj.Pkg().Path(), Def1: obj.Name(), Def2: Def2}
	}
	return &RefInfo{PkgPath: obj.Name()}
}

// var systemImp = importer.Default()

// func makeImporter() types.Importer {
// 	imp := systemImp

// 	if imp, ok := imp.(types.ImporterFrom); ok {
// 		return &sourceImporterFrom{
// 			ImporterFrom: imp,
// 			cached:       map[importerPkgKey]*types.Package{},
// 		}
// 	}
// 	return imp
// }

// type importerPkgKey struct{ path, srcDir string }

// type sourceImporterFrom struct {
// 	types.ImporterFrom

// 	cached map[importerPkgKey]*types.Package
// }

// func (s *sourceImporterFrom) Import(path string) (*types.Package, error) {
// 	return s.ImportFrom(path, "" /* no vendoring */, 0)
// }

// var _ (types.ImporterFrom) = (*sourceImporterFrom)(nil)

// func (s *sourceImporterFrom) ImportFrom(path, srcDir string, mode types.ImportMode) (*types.Package, error) {
// 	pkg, err := s.ImporterFrom.ImportFrom(path, srcDir, mode)
// 	if pkg != nil {
// 		return pkg, err
// 	}

// 	key := importerPkgKey{path, srcDir}
// 	if pkg := s.cached[key]; pkg != nil && pkg.Complete() {
// 		return pkg, nil
// 	}

// 	if debug {
// 		t0 := time.Now()
// 		defer func() {
// 			dlog.Printf("source import of %s took %s", path, time.Since(t0))
// 		}()
// 	}

// 	// Otherwise, parse from source.
// 	pkgs, err := parser.ParseDir(fset, srcDir, func(fi os.FileInfo) bool {
// 		return strings.HasSuffix(fi.Name(), ".go") && !strings.HasSuffix(fi.Name(), "_test.go")
// 	}, 0)
// 	if err != nil {
// 		return nil, err
// 	}
// 	var astPkg *ast.Package
// 	for pkgName, pkg := range pkgs {
// 		if pkgName != "main" && !strings.HasSuffix(pkgName, "_test") {
// 			astPkg = pkg
// 			break
// 		}
// 	}
// 	if astPkg == nil {
// 		return nil, fmt.Errorf("ImportFrom: no suitable package found (import path %q, dir %q)", path, srcDir)
// 	}

// 	pkgFiles := make([]*ast.File, 0, len(astPkg.Files))
// 	for _, f := range astPkg.Files {
// 		pkgFiles = append(pkgFiles, f)
// 	}

// 	conf := types.Config{
// 		Importer:                 systemImp,
// 		FakeImportC:              true,
// 		IgnoreFuncBodies:         true,
// 		DisableUnusedImportCheck: true,
// 		Error: func(error) {},
// 	}
// 	pkg, err = conf.Check(path, fset, pkgFiles, nil)
// 	if pkg != nil {
// 		s.cached[key] = pkg
// 	}
// 	return pkg, err
// }

////////////////////////////////////////////////////////////////////////////////////////
// The below code is copied from
// https://raw.githubusercontent.com/golang/tools/c86fe5956d4575f29850535871a97abbd403a145/go/ast/astutil/enclosing.go
// to eliminate external (non-stdlib) dependencies.
////////////////////////////////////////////////////////////////////////////////////////

func pathEnclosingInterval(root *ast.File, start, end token.Pos) (path []ast.Node, exact bool) {
	// fmt.Printf("EnclosingInterval %d %d\n", start, end) // debugging

	// Precondition: node.[Pos..End) and adjoining whitespace contain [start, end).
	var visit func(node ast.Node) bool
	visit = func(node ast.Node) bool {
		path = append(path, node)

		nodePos := node.Pos()
		nodeEnd := node.End()

		// fmt.Printf("visit(%T, %d, %d)\n", node, nodePos, nodeEnd) // debugging

		// Intersect [start, end) with interval of node.
		if start < nodePos {
			start = nodePos
		}
		if end > nodeEnd {
			end = nodeEnd
		}

		// Find sole child that contains [start, end).
		children := childrenOf(node)
		l := len(children)
		for i, child := range children {
			// [childPos, childEnd) is unaugmented interval of child.
			childPos := child.Pos()
			childEnd := child.End()

			// [augPos, augEnd) is whitespace-augmented interval of child.
			augPos := childPos
			augEnd := childEnd
			if i > 0 {
				augPos = children[i-1].End() // start of preceding whitespace
			}
			if i < l-1 {
				nextChildPos := children[i+1].Pos()
				// Does [start, end) lie between child and next child?
				if start >= augEnd && end <= nextChildPos {
					return false // inexact match
				}
				augEnd = nextChildPos // end of following whitespace
			}

			// fmt.Printf("\tchild %d: [%d..%d)\tcontains interval [%d..%d)?\n",
			// 	i, augPos, augEnd, start, end) // debugging

			// Does augmented child strictly contain [start, end)?
			if augPos <= start && end <= augEnd {
				_, isToken := child.(tokenNode)
				return isToken || visit(child)
			}

			// Does [start, end) overlap multiple children?
			// i.e. left-augmented child contains start
			// but LR-augmented child does not contain end.
			if start < childEnd && end > augEnd {
				break
			}
		}

		// No single child contained [start, end),
		// so node is the result.  Is it exact?

		// (It's tempting to put this condition before the
		// child loop, but it gives the wrong result in the
		// case where a node (e.g. ExprStmt) and its sole
		// child have equal intervals.)
		if start == nodePos && end == nodeEnd {
			return true // exact match
		}

		return false // inexact: overlaps multiple children
	}

	if start > end {
		start, end = end, start
	}

	if start < root.End() && end > root.Pos() {
		if start == end {
			end = start + 1 // empty interval => interval of size 1
		}
		exact = visit(root)

		// Reverse the path:
		for i, l := 0, len(path); i < l/2; i++ {
			path[i], path[l-1-i] = path[l-1-i], path[i]
		}
	} else {
		// Selection lies within whitespace preceding the
		// first (or following the last) declaration in the file.
		// The result nonetheless always includes the ast.File.
		path = append(path, root)
	}

	return
}

// tokenNode is a dummy implementation of ast.Node for a single token.
// They are used transiently by PathEnclosingInterval but never escape
// this package.
//
type tokenNode struct {
	pos token.Pos
	end token.Pos
}

func (n tokenNode) Pos() token.Pos {
	return n.pos
}

func (n tokenNode) End() token.Pos {
	return n.end
}

func tok(pos token.Pos, len int) ast.Node {
	return tokenNode{pos, pos + token.Pos(len)}
}

// childrenOf returns the direct non-nil children of ast.Node n.
// It may include fake ast.Node implementations for bare tokens.
// it is not safe to call (e.g.) ast.Walk on such nodes.
//
func childrenOf(n ast.Node) []ast.Node {
	var children []ast.Node

	// First add nodes for all true subtrees.
	ast.Inspect(n, func(node ast.Node) bool {
		if node == n { // push n
			return true // recur
		}
		if node != nil { // push child
			children = append(children, node)
		}
		return false // no recursion
	})

	// Then add fake Nodes for bare tokens.
	switch n := n.(type) {
	case *ast.ArrayType:
		children = append(children,
			tok(n.Lbrack, len("[")),
			tok(n.Elt.End(), len("]")))

	case *ast.AssignStmt:
		children = append(children,
			tok(n.TokPos, len(n.Tok.String())))

	case *ast.BasicLit:
		children = append(children,
			tok(n.ValuePos, len(n.Value)))

	case *ast.BinaryExpr:
		children = append(children, tok(n.OpPos, len(n.Op.String())))

	case *ast.BlockStmt:
		children = append(children,
			tok(n.Lbrace, len("{")),
			tok(n.Rbrace, len("}")))

	case *ast.BranchStmt:
		children = append(children,
			tok(n.TokPos, len(n.Tok.String())))

	case *ast.CallExpr:
		children = append(children,
			tok(n.Lparen, len("(")),
			tok(n.Rparen, len(")")))
		if n.Ellipsis != 0 {
			children = append(children, tok(n.Ellipsis, len("...")))
		}

	case *ast.CaseClause:
		if n.List == nil {
			children = append(children,
				tok(n.Case, len("default")))
		} else {
			children = append(children,
				tok(n.Case, len("case")))
		}
		children = append(children, tok(n.Colon, len(":")))

	case *ast.ChanType:
		switch n.Dir {
		case ast.RECV:
			children = append(children, tok(n.Begin, len("<-chan")))
		case ast.SEND:
			children = append(children, tok(n.Begin, len("chan<-")))
		case ast.RECV | ast.SEND:
			children = append(children, tok(n.Begin, len("chan")))
		}

	case *ast.CommClause:
		if n.Comm == nil {
			children = append(children,
				tok(n.Case, len("default")))
		} else {
			children = append(children,
				tok(n.Case, len("case")))
		}
		children = append(children, tok(n.Colon, len(":")))

	case *ast.Comment:
		// nop

	case *ast.CommentGroup:
		// nop

	case *ast.CompositeLit:
		children = append(children,
			tok(n.Lbrace, len("{")),
			tok(n.Rbrace, len("{")))

	case *ast.DeclStmt:
		// nop

	case *ast.DeferStmt:
		children = append(children,
			tok(n.Defer, len("defer")))

	case *ast.Ellipsis:
		children = append(children,
			tok(n.Ellipsis, len("...")))

	case *ast.EmptyStmt:
		// nop

	case *ast.ExprStmt:
		// nop

	case *ast.Field:
		// TODO(adonovan): Field.{Doc,Comment,Tag}?

	case *ast.FieldList:
		children = append(children,
			tok(n.Opening, len("(")),
			tok(n.Closing, len(")")))

	case *ast.File:
		// TODO test: Doc
		children = append(children,
			tok(n.Package, len("package")))

	case *ast.ForStmt:
		children = append(children,
			tok(n.For, len("for")))

	case *ast.FuncDecl:
		// TODO(adonovan): FuncDecl.Comment?

		// Uniquely, FuncDecl breaks the invariant that
		// preorder traversal yields tokens in lexical order:
		// in fact, FuncDecl.Recv precedes FuncDecl.Type.Func.
		//
		// As a workaround, we inline the case for FuncType
		// here and order things correctly.
		//
		children = nil // discard ast.Walk(FuncDecl) info subtrees
		children = append(children, tok(n.Type.Func, len("func")))
		if n.Recv != nil {
			children = append(children, n.Recv)
		}
		children = append(children, n.Name)
		if n.Type.Params != nil {
			children = append(children, n.Type.Params)
		}
		if n.Type.Results != nil {
			children = append(children, n.Type.Results)
		}
		if n.Body != nil {
			children = append(children, n.Body)
		}

	case *ast.FuncLit:
		// nop

	case *ast.FuncType:
		if n.Func != 0 {
			children = append(children,
				tok(n.Func, len("func")))
		}

	case *ast.GenDecl:
		children = append(children,
			tok(n.TokPos, len(n.Tok.String())))
		if n.Lparen != 0 {
			children = append(children,
				tok(n.Lparen, len("(")),
				tok(n.Rparen, len(")")))
		}

	case *ast.GoStmt:
		children = append(children,
			tok(n.Go, len("go")))

	case *ast.Ident:
		children = append(children,
			tok(n.NamePos, len(n.Name)))

	case *ast.IfStmt:
		children = append(children,
			tok(n.If, len("if")))

	case *ast.ImportSpec:
		// TODO(adonovan): ImportSpec.{Doc,EndPos}?

	case *ast.IncDecStmt:
		children = append(children,
			tok(n.TokPos, len(n.Tok.String())))

	case *ast.IndexExpr:
		children = append(children,
			tok(n.Lbrack, len("{")),
			tok(n.Rbrack, len("}")))

	case *ast.InterfaceType:
		children = append(children,
			tok(n.Interface, len("interface")))

	case *ast.KeyValueExpr:
		children = append(children,
			tok(n.Colon, len(":")))

	case *ast.LabeledStmt:
		children = append(children,
			tok(n.Colon, len(":")))

	case *ast.MapType:
		children = append(children,
			tok(n.Map, len("map")))

	case *ast.ParenExpr:
		children = append(children,
			tok(n.Lparen, len("(")),
			tok(n.Rparen, len(")")))

	case *ast.RangeStmt:
		children = append(children,
			tok(n.For, len("for")),
			tok(n.TokPos, len(n.Tok.String())))

	case *ast.ReturnStmt:
		children = append(children,
			tok(n.Return, len("return")))

	case *ast.SelectStmt:
		children = append(children,
			tok(n.Select, len("select")))

	case *ast.SelectorExpr:
		// nop

	case *ast.SendStmt:
		children = append(children,
			tok(n.Arrow, len("<-")))

	case *ast.SliceExpr:
		children = append(children,
			tok(n.Lbrack, len("[")),
			tok(n.Rbrack, len("]")))

	case *ast.StarExpr:
		children = append(children, tok(n.Star, len("*")))

	case *ast.StructType:
		children = append(children, tok(n.Struct, len("struct")))

	case *ast.SwitchStmt:
		children = append(children, tok(n.Switch, len("switch")))

	case *ast.TypeAssertExpr:
		children = append(children,
			tok(n.Lparen-1, len(".")),
			tok(n.Lparen, len("(")),
			tok(n.Rparen, len(")")))

	case *ast.TypeSpec:
		// TODO(adonovan): TypeSpec.{Doc,Comment}?

	case *ast.TypeSwitchStmt:
		children = append(children, tok(n.Switch, len("switch")))

	case *ast.UnaryExpr:
		children = append(children, tok(n.OpPos, len(n.Op.String())))

	case *ast.ValueSpec:
		// TODO(adonovan): ValueSpec.{Doc,Comment}?

	case *ast.BadDecl, *ast.BadExpr, *ast.BadStmt:
		// nop
	}

	// TODO(adonovan): opt: merge the logic of ast.Inspect() into
	// the switch above so we can make interleaved callbacks for
	// both Nodes and Tokens in the right order and avoid the need
	// to sort.
	sort.Sort(byPos(children))

	return children
}

type byPos []ast.Node

func (sl byPos) Len() int {
	return len(sl)
}
func (sl byPos) Less(i, j int) bool {
	return sl[i].Pos() < sl[j].Pos()
}
func (sl byPos) Swap(i, j int) {
	sl[i], sl[j] = sl[j], sl[i]
}
