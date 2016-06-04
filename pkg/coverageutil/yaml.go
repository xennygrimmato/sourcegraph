package coverageutil

import (
	"github.com/attfarhan/yaml"
)

type yamlTokenizer struct {
	// values are the tokens returned by the tokenizer
	values     []string
	startBytes []int
	lines      []int
	// pointer is the index we're currently viewing in each of the arrays
	pointer int
}

func (s *yamlTokenizer) Init(src []byte) {
	p := yaml.NewParser(src)
	// node is the tree of tokens returned by the parser.
	node := p.Parse()

	fileString := string(src)

	// List of nodes representing tokens.  Remove the first element because YAML
	// always starts with an empty token representing the start of a document,
	// and begins any collection (sequence, mapping, any section of text) with
	// an empty token (both considered starting at byte 0). If we don't remove
	// it, we will get a duplicate ref key make failure for every file.
	tokenList := []*yaml.Node{}
	if node == nil {
		tokenList = []*yaml.Node{}
	} else {
		tokenList = yaml.Explore(fileString, node)[1:]
	}

	for _, token := range tokenList {
		s.lines = append(s.lines, token.Line)
		s.values = append(s.values, token.Value)
		s.startBytes = append(s.startBytes, token.StartByte)
	}
	s.pointer = 0
}

func (s *yamlTokenizer) Next() *Token {
	defer func() { s.pointer++ }()
	if s.pointer >= len(s.values) {
		return nil
	}
	return &Token{
		Offset: uint32(s.startBytes[s.pointer]),
		Text:   s.values[s.pointer],
		Line:   s.lines[s.pointer],
	}
}

func (s *yamlTokenizer) Done() {}

func init() {
	factory := func() Tokenizer {
		return &yamlTokenizer{}
	}
	newExtensionBasedLookup("YAML", []string{".yml", ".yaml"}, factory)
}
