package golang

import (
	"go/ast"
	"go/token"
	"sort"

	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

// sortSources sorts DefsOp.Sources files (the map keys) for
// determinism.
func sortSources(sources map[string][]byte) []string {
	names := make([]string, 0, len(sources))
	for name := range sources {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
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
