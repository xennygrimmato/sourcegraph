package coverageutil

import (
	"github.com/attfarhan/yaml"
	// "log"
)

type yamlTokenizer struct {
	// String values of tokens in the tokenizer
	values     []string
	startBytes []int
	line       []int
	// Pointer represents the index in each
	// field as we traverse each field.
	pointer int
}

// Initializes text scanner that extracts only idents
func (s *yamlTokenizer) Init(src []byte) {
	// construct a new parser
	p := yaml.NewParser(src)
	// node is the tree of tokens returned by the parser.
	node := p.Parse()

	fileString := string(src)

	// List of nodes representing tokens.  Remove the first because YAML
	// always starts with an empty token, and begins any sequence with
	// an empty token (both considered starting at byte 0). If we don't remove
	// it, we will get a duplicate ref key make failure for every file.
	tokenList := yaml.Explore(fileString, node)[1:]

	for _, token := range tokenList {
		s.line = append(s.line, token.Line)
		s.values = append(s.values, token.Value)
		s.startBytes = append(s.startBytes, token.StartByte)
	}
	s.pointer = 0
}

// Next returns YAML idents
func (s *yamlTokenizer) Next() *Token {
	if s.pointer >= len(s.values) {
		return nil
	}
	out := &Token{}
	out.Offset = uint32(s.startBytes[s.pointer])
	out.Text = s.values[s.pointer]
	out.Line = s.line[s.pointer]
	s.pointer++

	return out
}

func (s *yamlTokenizer) Done() {}

func init() {
	factory := func() Tokenizer {
		return &yamlTokenizer{}
	}
	newExtensionBasedLookup("YAML", []string{".yml", ".yaml"}, factory)
}
