package coverageutil

import (
	"testing"
)

func TestYAML(t *testing.T) {
	testTokenizer(t, &yamlTokenizer{}, []*test{
		{
			"language: go",
			"language: go",
			[]Token{{0, 0, ""}, {0, 0, "language"}, {10, 0, "go"}},
		},
		{
			"empty",
			"",
			[]Token{{0, 0, ""}, {0, 0, "language"}, {10, 0, "go"}},
		},
		{
			"go",
			"go",
			[]Token{{0, 0, ""}, {0, 0, "language"}, {10, 0, "go"}, {0, 0, "go"}},
		},
	})
}
