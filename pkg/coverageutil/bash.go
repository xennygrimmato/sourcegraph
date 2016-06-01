package coverageutil

import (
	"bytes"

	"text/scanner"
)

// bashTokenizer produces tokens from a Bash script
type bashTokenizer struct {
	scanner *scanner.Scanner
}

// Initializes text scanner that extracts only idents
func (s *bashTokenizer) Init(src []byte) {
	s.scanner = &scanner.Scanner{}
	s.scanner.Error = func(s *scanner.Scanner, msg string) {}
	s.scanner.Init(bytes.NewReader(src))
}

func (s *bashTokenizer) Done() {
}

// Next returns idents that are not bash keywords
func (s *bashTokenizer) Next() *Token {
	return nil
}

func init() {
	var factory = func() Tokenizer {
		return &bashTokenizer{}
	}
	newExtensionBasedLookup("Bash", []string{".sh"}, factory)
}
