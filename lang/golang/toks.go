package golang

import (
	"fmt"
	"go/ast"
	"go/scanner"
	"go/token"
	"strings"

	"golang.org/x/net/context"
	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

func (s *langServer) Toks(ctx context.Context, op *lang.ToksOp) (*lang.ToksResult, error) {
	res := &lang.ToksResult{Complete: true}

	fset := token.NewFileSet()
	file := fset.AddFile("", fset.Base(), len(op.Source))

	errorHandler := func(pos token.Position, msg string) {
		res.Complete = false
		res.Messages = append(res.Messages, fmt.Sprintf("@%d: %s", pos.Offset, msg))
	}

	var sc scanner.Scanner
	sc.Init(file, op.Source, errorHandler, scanner.ScanComments)

	for {
		pos, tok, lit := sc.Scan()
		if tok == token.EOF {
			break
		}

		var typ lang.Tok_TokType
		switch tok {
		case token.IDENT:
			if _, present := predeclaredTypes[lit]; present {
				typ = lang.Tok_NAME_BUILTIN
			} else if _, present := predeclaredFuncs[lit]; present {
				typ = lang.Tok_NAME_BUILTIN
			} else if _, present := predeclaredConstants[lit]; present {
				typ = lang.Tok_NAME_CONSTANT
			} else if ast.IsExported(lit) {
				typ = lang.Tok_NAME_CLASS // hack to differentiate
			} else {
				typ = lang.Tok_NAME
			}

		case token.COMMENT:
			if strings.HasPrefix(lit, "/*") {
				typ = lang.Tok_COMMENT_MULTILINE
			} else {
				typ = lang.Tok_COMMENT_SINGLE
			}
		case token.INT:
			if strings.HasPrefix(lit, "0x") || strings.HasPrefix(lit, "0X") {
				typ = lang.Tok_NUMBER_HEX
			} else if len(lit) > 1 && lit[0] == '0' {
				typ = lang.Tok_NUMBER_OCT
			} else {
				typ = lang.Tok_NUMBER_INTEGER
			}
		case token.FLOAT:
			typ = lang.Tok_NUMBER_FLOAT
		case token.IMAG:
			typ = lang.Tok_NUMBER
		case token.CHAR:
			typ = lang.Tok_STRING_CHAR
		case token.STRING:
			typ = lang.Tok_STRING
		default:
			switch {
			case tok.IsLiteral():
				typ = lang.Tok_LITERAL
			case tok.IsOperator():
				typ = lang.Tok_OPERATOR
			case tok.IsKeyword():
				typ = lang.Tok_KEYWORD
			}
		}

		var byteLen int
		if lit != "" {
			byteLen = len(lit)
		} else {
			byteLen = len(tok.String())
		}

		res.Toks = append(res.Toks, &lang.Tok{
			StartByte: uint32(fset.Position(pos).Offset),
			ByteLen:   uint32(byteLen),
			Type:      typ,
		})
	}

	return res, nil
}

// The following lists of predeclared names are from the go/doc
// package sources.

var predeclaredTypes = map[string]bool{
	"bool":       true,
	"byte":       true,
	"complex64":  true,
	"complex128": true,
	"error":      true,
	"float32":    true,
	"float64":    true,
	"int":        true,
	"int8":       true,
	"int16":      true,
	"int32":      true,
	"int64":      true,
	"rune":       true,
	"string":     true,
	"uint":       true,
	"uint8":      true,
	"uint16":     true,
	"uint32":     true,
	"uint64":     true,
	"uintptr":    true,
}

var predeclaredFuncs = map[string]bool{
	"append":  true,
	"cap":     true,
	"close":   true,
	"complex": true,
	"copy":    true,
	"delete":  true,
	"imag":    true,
	"len":     true,
	"make":    true,
	"new":     true,
	"panic":   true,
	"print":   true,
	"println": true,
	"real":    true,
	"recover": true,
}

var predeclaredConstants = map[string]bool{
	"false": true,
	"iota":  true,
	"nil":   true,
	"true":  true,
}
