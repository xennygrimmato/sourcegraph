package p

func init() {
	F          // p F
	T          // p T
	(&T{}).F0  // p T F0
	(T{}).F0   // p T F0
	(&T{}).F1  // p S F1
	(T{}).F1   // p S F1
	(&T{}).F2  // p P F2
	(T{}).F2   // p P F2
	(&T{}).M0  // p T M0
	(T{}).M0   // p T M0
	(&T{}).M1  // p T M1
	(&T{}).M2  // p T M2
	(T{}).M2   // p T M2
	(&T{}).M3  // p T M3
	(&T{}).M4  // p T M4
	(T{}).M4   // p T M4
	(&T{}).M5  // p T M5
	(T{}).M6   // p S M6
	(&T{}).M6  // p S M6
	(&T{}).M7  // p P M7
	I(nil).M8  // p I M8
	(&T{}).M8  // p I M8
	(T{}).M8   // p I M8
	(&P{}).M8  // p I M8
	(P{}).M8   // p I M8
	I(nil).M9  // p J M9
	J(nil).M9  // p J M9
	(&T{}).M9  // p J M9
	(T{}).M9   // p J M9
	(&P{}).M9  // p J M9
	(P{}).M9   // p J M9
	K(nil).M10 // p K M10
	(&T{}).M10 // p K M10
	(T{}).M10  // p K M10
	I(nil).M11 // p L M11
	L(nil).M11 // p L M11
	(&T{}).M11 // p L M11
	(T{}).M11  // p L M11
	I(nil).M12 // p L M12
	L(nil).M12 // p L M12
	(&T{}).M12 // p L M12
	(T{}).M12  // p L M12

	error  // builtin error
	string // builtin string
	make   // builtin make

	y := 3 //y: builtin int
	y      // builtin int

	z := T{} //z: p T
	z        // p T
}

func F() {} //F: p F

type T struct { //T: p T
	F0 int //F0: p T F0
	S
	*P
	K //K: p T K
}

func (T) M0()    {}
func (*T) M1()   {}
func (_ T) M2()  {}
func (_ *T) M3() {}
func (t T) M4()  {}
func (t *T) M5() {} //M5: p T M5

type S struct{ F1 int }

func (S) M6() {}

type P struct {
	I
	F2 int
}

func (P) M7() {}

type I interface { //I: p I
	L //L: p L
	M8()
	J
}

type J interface {
	M9()
}

type K interface {
	M10()
}

type L interface {
	M11()
	M12() //M12: p L M12
}

var M = 1 //M: p M

const N = 2 //N: p N
