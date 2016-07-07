// An Animal is a friendly creature that can say hello and make a noise.
function Animal(name) {
  this.name = name;
}

// sayHello greets the caller.
Animal.prototype.sayHello = function() {
  return 'Hello from ' + this.name;
};

// makeNoise emits the animal's characteristic noise.
Animal.prototype.makeNoise = function() {
  return this.noise || '<chirp>';
};

// A Dog is an animal.
function Dog(name, breed) {
  this.name = name;
  this.breed = breed;
  this.noise = 'Woof!';
}

Dog.prototype = new Animal();

// sayExtendedHello gives a doggy greeting.
Dog.prototype.sayExtendedHello = function() {
  return this.sayHello() + ', ' + this.breed;
};

// bark barks.
Dog.prototype.bark = function() {
  return this.noise;
};

module.exports = {
  Animal: Animal,
  Dog: Dog,
};
