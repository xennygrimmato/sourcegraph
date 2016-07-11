package refinfo

import (
	"fmt"
	"go/ast"
	"go/build"
	"go/parser"
	"go/token"
	"go/types"
	"log"
	"os"
	"strings"
	"time"
)

func newImporter(fset *token.FileSet, build *build.Context) types.Importer {
	return &sourceImporterFrom{
		fset:   fset,
		build:  build,
		cached: map[importerPkgKey]*types.Package{},
	}
}

type importerPkgKey struct{ path, srcDir string }

type sourceImporterFrom struct {
	fset   *token.FileSet
	build  *build.Context
	cached map[importerPkgKey]*types.Package
}

func (s *sourceImporterFrom) Import(path string) (*types.Package, error) {
	return s.ImportFrom(path, "" /* no vendoring */, 0)
}

var _ (types.ImporterFrom) = (*sourceImporterFrom)(nil)

func (s *sourceImporterFrom) ImportFrom(path, srcDir string, mode types.ImportMode) (*types.Package, error) {
	log.Println("XXXXXXXXX IMPORT", path+"QQQQ")

	key := importerPkgKey{path, srcDir}
	if pkg := s.cached[key]; pkg != nil {
		if pkg.Complete() {
			return pkg, nil
		}
		return nil, fmt.Errorf("ImportFrom: cycle detected: %s", path)
	}

	if true {
		t0 := time.Now()
		defer func() {
			dlog.Printf("source import of %s took %s", path, time.Since(t0))
		}()
	}

	// Otherwise, parse from source.
	pkgs, err := parser.ParseDir(s.fset, srcDir, func(fi os.FileInfo) bool {
		return strings.HasSuffix(fi.Name(), ".go") && !strings.HasSuffix(fi.Name(), "_test.go")
	}, 0)
	if err != nil {
		return nil, err
	}
	var astPkg *ast.Package
	for pkgName, pkg := range pkgs {
		if pkgName != "main" && !strings.HasSuffix(pkgName, "_test") {
			astPkg = pkg
			break
		}
	}
	if astPkg == nil {
		return nil, fmt.Errorf("ImportFrom: no suitable package found (import path %q, dir %q)", path, srcDir)
	}

	pkgFiles := make([]*ast.File, 0, len(astPkg.Files))
	for _, f := range astPkg.Files {
		pkgFiles = append(pkgFiles, f)
	}

	conf := types.Config{
		Importer:                 s,
		FakeImportC:              true,
		IgnoreFuncBodies:         true,
		DisableUnusedImportCheck: true,
		Error: func(error) {},
	}
	pkg, err := conf.Check(path, s.fset, pkgFiles, nil)
	if pkg != nil {
		s.cached[key] = pkg
	}
	return pkg, err
}
