package coverageutil

import (
	"bytes"

	"github.com/mkovacs/bash/scanner"
)

// bashIdentScanner extracts identifiers from a Bash script
type bashIdentScanner struct {
	is *scanner.Scanner
}

// Initializes text scanner that extracts only idents
func (s *bashIdentScanner) Init(src []byte) {
	s.is = &scanner.Scanner{}
	s.is.Init(bytes.NewReader(src))
}

func (s *bashIdentScanner) Done() {
}

// Next returns the next identifier
func (s *bashIdentScanner) Next() *Token {
	for {
		tok, err := s.is.Scan()
		if err != nil {
			return nil
		}
		switch {
		case tok == scanner.EOF:
			return nil
		case tok == scanner.Ident:
			text := s.is.TokenText()
			p := s.is.Pos()
			return &Token{uint32(p.Offset - len(text)), p.Line, text}
		}
	}
}

func init() {
	var factory = func() Tokenizer {
		return &bashIdentScanner{}
	}
	newExtensionBasedLookup("Bash", []string{".sh"}, factory)
}
