package coverageutil

import (
	"bytes"
	"text/scanner"
)

type yamlTokenizer struct {
	scanner *scanner.Scanner
}

func (s *yamlTokenizer) Init(src []byte) {
	s.scanner = &scanner.Scanner{}
	s.scanner.Error = func(s *scanner.Scanner, msg string) {}
	s.scanner.Init(bytes.NewReader(src))
}

func (s *yamlTokenizer) Done() {
}

func (s *yamlTokenizer) Next() *Token {
	for {
		r := s.scanner.Scan()
		if r == scanner.EOF {
			return nil
		}
		if r != scanner.Ident {
			continue
		}
		text := s.scanner.TokenText()
		p := s.scanner.Pos()
		return &Token{uint32(p.Offset - len([]byte(text))), text}
	}
}

func init() {
	var factory = func() Tokenizer {
		return &javaTokenizer{}
	}
	newExtensionBasedLookup("YAML", []string{".yml"}, factory)
}
