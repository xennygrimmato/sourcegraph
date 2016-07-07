function quux() {
	return 1;
}

// method properties
var obj1 = {
    foo (a, b) {
    },
    bar (x, y) {
    },
    *quux (x, y) {
    }
};
obj1.foo(1, 2);
obj1.bar(1, 2);
obj1.quux(1, 2);

// computed property names
var obj2 = {
    foo: "bar",
    [ "baz" + quux() ]: 42
};
obj2.foo;

var propX = 'a';
var propY = 'b';

// property shorthand
var obj3 = { propX, propY };
obj3.propX;
propX;
obj3.propY;
propY;

