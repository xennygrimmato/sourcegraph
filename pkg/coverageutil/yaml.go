package coverageutil

import (
	"fmt"
	"github.com/attfarhan/yaml"
)

type yamlTokenizer struct {
	values     []string
	startBytes []int
	pointer    int
}

type T struct {
	value  []string
	line   []int
	column []int
}

// Initializes text scanner that extracts only idents
func (s *yamlTokenizer) Init(src []byte) {
	p := yaml.NewParser(src)
	node := p.Parse()
	var nodeList []*yaml.Node
	tokenList := yaml.Explore(node, nodeList)
	out := &T{}
	getLineAndColumn(tokenList, string(src), out)
	for i, _ := range out.value {
		start, _, value := findOffsets(string(src), out.line[i], out.column[i], out.value[i])
		s.values = append(s.values, value)
		s.startBytes = append(s.startBytes, start)
	}

	s.pointer = 0
}

// Next returns idents that are not Java keywords
func (s *yamlTokenizer) Next() *Token {
	if s.pointer >= len(s.values) {
		return nil
	}
	out := &Token{}
	out.Offset = uint32(s.startBytes[s.pointer])
	out.Text = s.values[s.pointer]
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

func getLineAndColumn(tokenList []*yaml.Node, fileString string, out *T) {
	for _, token := range tokenList {
		out.value = append(out.value, token.Value)
		out.line = append(out.line, token.Line)
		out.column = append(out.column, token.Column)
		// a, b := findOffsets(data, token.Line, token.Column, token.Value)
		// fmt.Println("start: ", a, "End: ", b)
		getLineAndColumn(token.Children, fileString, out)
	}
}

func findOffsets(fileText string, line, column int, token string) (start, end int, value string) {

	// we count our current line and column position.
	currentCol := 0
	currentLine := 0
	for offset, ch := range fileText {
		// see if we found where we wanted to go to.
		if currentLine == line && currentCol == column {
			end = offset + len([]byte(token))
			return offset, end, token
		}

		// line break - increment the line counter and reset the column.
		if ch == '\n' {
			currentLine++
			currentCol = 0
		} else {
			currentCol++
		}
	}
	return -1, -1, token // not found.
}
