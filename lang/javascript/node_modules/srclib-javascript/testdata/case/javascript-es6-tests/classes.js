class A  {

	// constructor
	constructor(name) {
		// properties
		this._name = name;
	}

	// getter
	get name() { return this._name; }

	// setter
	set name(name) { this._name = name; }

	rename() {
		// getter setter
		this.name = this.name;
	}

	// static method
	static method() {}

}

// extends
class B extends A {

	constructor (name) {
		// super constructor
        super(name);
	}

	foo() {
		// this method
		this.rename();
		// super method
		super.rename();
	}
}

// static method
A.method();

// class without a name
var AGirlHasNoName = class {

	constructor() {
		this.x = 1;
	}
};
var arya = new AGirlHasNoName();

// class without a name
class {
	constructor() {
		this.y = 1;
	}
}