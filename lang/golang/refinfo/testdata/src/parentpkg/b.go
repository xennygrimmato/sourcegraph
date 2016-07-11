package parentpkg

/* uses GOPATH=/path/to/refinfo/testdata */
import "parentpkg/subpkg"

func init() {
	subpkg.C0()
}

func B0() {}

func b1() {}

var b2 string

const b3 = 123

type b4 struct{}

func (b4) b5() {}
