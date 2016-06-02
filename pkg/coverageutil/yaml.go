package coverageutil

import (
	"fmt"
	"github.com/attfarhan/yaml"
)

type yamlTokenizer struct {
	// string values of tokens in the tokenizer
	values     []string
	startBytes []int
	line       []int
	// pointer points to the current index in the tokenizer
	// when we traverse the tokenizer to get each token
	pointer int
}

// TokenInfo struct is used to hold line, column, and text
// for all tokens in a file
type TokenInfo struct {
	// value is the text value of the tokens in the token info list
	value  []string
	line   []int
	column []int
}

// Initializes text scanner that extracts only idents
func (s *yamlTokenizer) Init(src []byte) {
	// construct a new parser
	p := yaml.NewParser(src)
	// node is the tree of tokens returned by the parser
	node := p.Parse()
	var nodeList []*yaml.Node
	// tokenList is a list of nodes representing tokens
	// created by traversing the tree of nodes
	tokenList := yaml.Explore(node, nodeList)

	out := &TokenInfo{}
	// we fill an out struct with the token value and matching line and column
	fillLineAndColumn(tokenList, out)
	fileString := string(src)
	// traverse the value field of the out struct to get
	// the starting byte offsets for each token and store the
	// relevant information for each token in the tokenizer
	for i, _ := range out.value {
		start, value := findOffsets(fileString, out.line[i], out.column[i], out.value[i])
		s.line = append(s.line, out.line[i])
		s.values = append(s.values, value)
		s.startBytes = append(s.startBytes, start)
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
	fmt.Println(out)

	return out
}

func (s *yamlTokenizer) Done() {}

func init() {
	var factory = func() Tokenizer {
		return &yamlTokenizer{}
	}
	newExtensionBasedLookup("YAML", []string{".yml"}, factory)
}

func fillLineAndColumn(tokenList []*yaml.Node, out *TokenInfo) {
	for _, token := range tokenList {
		out.value = append(out.value, token.Value)
		out.line = append(out.line, token.Line)
		out.column = append(out.column, token.Column)
		fillLineAndColumn(token.Children, out)
	}
}

func findOffsets(fileText string, line, column int, token string) (start int, value string) {

	// we count our current line and column position.
	currentCol := 0
	currentLine := 0
	for offset, ch := range fileText {
		fmt.Println(ch)
		if currentLine == line && currentCol == column {
			return offset, token
		}

		// line break - increment the line counter and reset the column.
		if ch == '\n' {
			currentLine++
			currentCol = 0
		} else {
			currentCol++
		}
	}
	return -1, token // not found.
}
