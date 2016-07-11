package golang

import (
	"fmt"
	"go/ast"
	"go/build"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path"
	"runtime"
	"strings"
	"time"

	"golang.org/x/net/context"
	"golang.org/x/tools/go/loader"

	"sourcegraph.com/sourcegraph/sourcegraph/lang"
	"sourcegraph.com/sourcegraph/sourcegraph/lang/golang/refinfo"
)

const _TMP_pkgPath = "github.com/gorilla/mux" // TODO(sqs): unhardcode

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
	t0 := time.Now()

	bctx := build.Context{
		GOARCH:     runtime.GOARCH,
		GOOS:       runtime.GOOS,
		GOROOT:     "/usr/local/go",
		GOPATH:     os.Getenv("GOPATH"),
		CgoEnabled: false,
		// UseAllFiles: true,
		Compiler: "gc",

		// TODO(sqs): make these use OS-independent separators
		JoinPath: path.Join,
		SplitPathList: func(list string) []string {
			if list == "" {
				return []string{}
			}
			return strings.Split(list, ":")
		},
		IsAbsPath: path.IsAbs,
		IsDir: func(path string) bool {
			// log.Printf("BCTX: IsDir(%q)", path)
			fi, _ := os.Stat(path)
			return fi != nil && fi.IsDir()
		},
		HasSubdir: func(root, dir string) (rel string, ok bool) {
			// log.Printf("BCTX: HasSubdir(%q, %q)", root, dir)
			root = path.Clean(root)
			dir = path.Clean(dir)
			if !strings.HasSuffix(root, "/") {
				root += "/"
			}
			if !strings.HasPrefix(dir, root) {
				return "", false
			}
			return dir[len(root):], true
		},
		ReadDir: func(dir string) ([]os.FileInfo, error) {
			// log.Printf("BCTX: ReadDir(%q)", dir)
			return ioutil.ReadDir(dir)
		},
		OpenFile: func(path string) (io.ReadCloser, error) {
			// log.Printf("BCTX: OpenFile(%q)", path)
			return os.Open(path)
		},
	}

	fset := token.NewFileSet()

	conf := loader.Config{
		Fset:       fset,
		ParserMode: parser.ParseComments,
		TypeChecker: types.Config{
			Importer:                 importer.Default(),
			FakeImportC:              true,
			DisableUnusedImportCheck: true,
		},
		TypeCheckFuncBodies: func(path string) bool { return path == _TMP_pkgPath },
		Build:               &bctx,
		Cwd:                 "/dev/null", // TODO(sqs): is this right?
		AllowErrors:         true,
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
				pkgsWithOrigin[key] = struct{}{}
			}
		}
	}

	for key := range pkgsWithOrigin {
		conf.CreateFromFiles(_TMP_pkgPath /* TODO(sqs): use import path not name */, pkgFiles[key]...)
	}
	log.Println("## Parsing took", time.Since(t0))
	t0 = time.Now()

	prog, err := conf.Load()
	if err != nil {
		return nil, err
	}
	log.Println("## Typechecking took", time.Since(t0))

	for _, origin := range op.Origins {
		file := origins[origin.File]
		if file == nil {
			hasErrors = true
			res.Messages = append(res.Messages, fmt.Sprintf("origin file not parsed (check for parse error and file existence): %s", origin))
			continue
		}

		pkg, _, _ := prog.PathEnclosingInterval(file.Pos(), file.End())
		if pkg == nil {
			return nil, fmt.Errorf("no pkg found for file %s", origin.File)
		}

		refs, err := indexFileRefs(fset, pkg, file)
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

func indexFileRefs(fset *token.FileSet, pkg *loader.PackageInfo, file *ast.File) ([]*lang.Ref, error) {
	v := refVisitor{
		fset:    fset,
		pkg:     pkg,
		pkgName: file.Name.Name,
		file:    file,
	}
	ast.Walk(&v, file)
	return v.refs, nil
}

type refVisitor struct {
	fset    *token.FileSet
	pkg     *loader.PackageInfo
	pkgName string
	file    *ast.File
	defs    []*lang.Def
	refs    []*lang.Ref
}

// Visit implements the ast.Visitor interface.
func (v *refVisitor) Visit(node ast.Node) ast.Visitor {
	switch n := node.(type) {
	case *ast.Ident:
		ri, err := refinfo.Get(v.pkg, v.file, n.Pos())
		if err != nil {
			log.Println("WALK: ", err)
			return nil
		}

		ref := &lang.Ref{
			Span:   makeSpan(v.fset, n),
			Target: resolveIdent(v.fset, n, v.pkgName, ri),
		}

		v.refs = append(v.refs, ref)
	}
	return v
}

func resolveIdent(fset *token.FileSet, n *ast.Ident, pkgName string, ri *refInfo) (t *lang.Target) {
	t = &lang.Target{Id: ri.defName()}

	// TODO(sqs): handle imported package names, like "http" for
	// "net/http".

	if n.Obj != nil && n.Obj.Decl != nil {
		if decl, ok := n.Obj.Decl.(ast.Node); ok {
			t.Span = makeSpan(fset, decl)
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
		addGoPackageImportPathMeta(t.Constraints, ri.pkgPath)

		// Also apply package name constraint for dirs with multiple
		// packages in them (e.g., package main, xyz, xyz_test, etc.).
		addGoPackageNameMeta(t.Constraints, pkgName)
	}
	return t
}
