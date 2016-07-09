package golang

import (
	"reflect"
	"testing"

	"sourcegraph.com/sourcegraph/sourcegraph/lang"
)

func TestIndexer(t *testing.T) {
	tests := []struct {
		op   *lang.DefsOp
		want *lang.DefsResult
	}{}
	for _, test := range tests {
		res, err := index(test.op)
		if err != nil {
			t.Errorf("indexing failed: %s\n\n%#v", err, test.op)
			continue
		}
		if !reflect.DeepEqual(res, test.want) {
			t.Errorf("indexing result != expected\n\nop\n%#v\n\ngot\n%#v\n\nwant\n%#v", test.op, res, test.want)
		}
	}
}
