// +build ignore

package main

import (
	"bytes"
	"flag"
	"fmt"
	"go/ast"
	"go/build"
	"go/format"
	"go/parser"
	"go/printer"
	"go/token"
	"io"
	"log"
	"os"
	"regexp"
	"sort"
	"strings"

	"sourcegraph.com/sourcegraph/sourcegraph/pkg/gen"
)

var (
	ifacePat = flag.String("iface_pat", `^(sourcegraph|pb|gitpb)\.\w+Server$`, "type name pattern")
	outFile  = flag.String("o", "", "output file (default: stdout)")

	fset = token.NewFileSet()
)

func main() {
	flag.Parse()
	log.SetFlags(0)

	pat, err := regexp.Compile(*ifacePat)
	if err != nil {
		log.Fatal(err)
	}

	bpkg, err := build.ImportDir(".", 0)
	if err != nil {
		log.Fatal(err)
	}
	goFilesOnly := func(fi os.FileInfo) bool {
		for _, f := range bpkg.GoFiles {
			if fi.Name() == f {
				return true
			}
		}
		return false
	}

	astPkgs, err := parser.ParseDir(fset, ".", goFilesOnly, parser.AllErrors)
	if err != nil {
		log.Fatal(err)
	}

	var astPkg *ast.Package
	for _, p := range astPkgs {
		astPkg = p
	}
	if astPkg == nil {
		log.Fatal("Error: no AST packages found in the current directory.")
	}

	serverVars := gen.Vars(astPkg, func(vspec *ast.ValueSpec) bool {
		server := &serverImpl{vspec}
		return server.varName() != "_" && pat.MatchString(server.typeName())
	})
	if len(serverVars) == 0 {
		log.Printf("warning: package has no vars that implement server interface types matching %q", *ifacePat)
	}
	servers := make([]*serverImpl, len(serverVars))
	for i, v := range serverVars {
		servers[i] = &serverImpl{v}
	}

	src, err := write(servers, astPkg.Name)
	if err != nil {
		log.Fatal(err)
	}

	var w io.Writer
	if *outFile == "" {
		w = os.Stdout
	} else {
		f, err := os.Create(*outFile)
		if err != nil {
			log.Fatal(err)
		}
		defer f.Close()
		w = f
	}
	if _, err := w.Write(src); err != nil {
		log.Fatal(err)
	}
}

type serverImpl struct {
	spec *ast.ValueSpec
}

func (s *serverImpl) varName() string { return s.spec.Names[0].Name }

func (s *serverImpl) typeName() string { return astString(s.spec.Type) }

func (s *serverImpl) serverName() string {
	return strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(strings.TrimPrefix(s.typeName(), "sourcegraph."), "pb."), "gitpb."), "Server")
}

type serverImpls []*serverImpl

func (v serverImpls) Len() int           { return len(v) }
func (v serverImpls) Less(i, j int) bool { return v[i].serverName() < v[j].serverName() }
func (v serverImpls) Swap(i, j int)      { v[i], v[j] = v[j], v[i] }

func write(servers []*serverImpl, outPkgName string) ([]byte, error) {
	// Sort for determinism.
	sort.Sort(serverImpls(servers))

	var w bytes.Buffer

	fmt.Fprintln(&w, "// GENERATED CODE - DO NOT EDIT!")
	fmt.Fprintln(&w, "// \x40generated")
	fmt.Fprintln(&w, "//")
	fmt.Fprintln(&w, "// Generated by:")
	fmt.Fprintln(&w, "//")
	fmt.Fprintf(&w, "//   go run gen_list.go %s\n", strings.Join(os.Args[1:], " "))
	fmt.Fprintln(&w, "//")
	fmt.Fprintln(&w, "// Called via:")
	fmt.Fprintln(&w, "//")
	fmt.Fprintln(&w, "//   go generate")
	fmt.Fprintln(&w, "//")
	fmt.Fprintln(&w)
	fmt.Fprint(&w, "package ", outPkgName, "\n")
	fmt.Fprintln(&w)
	fmt.Fprintln(&w, "import (")
	fmt.Fprint(&w, "\t", `"sourcegraph.com/sourcegraph/sourcegraph/services/svc"`, "\n")
	fmt.Fprintln(&w, ")")
	fmt.Fprintln(&w)

	// WithLocalServices
	fmt.Fprintln(&w, "// Services contains all services implemented in this package.")
	fmt.Fprintln(&w, "var Services = svc.Services{")
	for _, s := range servers {
		fmt.Fprintf(&w, "\t%s: %s,\n", s.serverName(), s.varName())
	}
	fmt.Fprintln(&w, "}")

	return format.Source(w.Bytes())
}

func astString(x ast.Expr) string {
	if x == nil {
		return ""
	}
	var buf bytes.Buffer
	if err := printer.Fprint(&buf, fset, x); err != nil {
		panic(err)
	}
	return buf.String()
}
