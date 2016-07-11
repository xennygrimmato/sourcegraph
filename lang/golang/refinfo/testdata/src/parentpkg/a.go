package parentpkg

/* uses GOPATH=/path/to/refinfo/testdata */
import (
	"parentpkg/subpkg"
	"strings"
)

func init() {
	A0               // parentpkg A0
	a1               // parentpkg a1
	a2               // parentpkg a2
	a3               // parentpkg a3
	(a4{}).a5        // parentpkg a4 a5
	B0               // parentpkg B0
	b1               // parentpkg b1
	b2               // parentpkg b2
	b3               // parentpkg b3
	(b4{}).b5        // parentpkg b4 b5
	subpkg.C0        // parentpkg/subpkg C0
	(subpkg.C1{}).C2 // parentpkg/subpkg C1 C2
	strings.Contains // strings Contains
}

func A0() {}

func a1() {}

var a2 string

const a3 = 123

type a4 struct{}

func (a4) a5() {}
