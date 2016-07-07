var animal = require('../animal'),
    should = require('should');

describe('Animal', function() {
  it('creates a new animal', function(done) {
    var a = new animal.Animal('alice');
    a.name.should.eql('alice');
    done();
  });
  it('says hello', function(done) {
    var a = new animal.Animal('alice');
    a.sayHello().should.eql('Hello from alice');
    done();
  });
  it('makes noise', function(done) {
    var a = new animal.Animal('alice');
    a.makeNoise().should.eql('<chirp>');
    done();
  });
});

describe('Dog', function() {
  it('creates a new dog', function(done) {
    var a = new animal.Dog('alice');
    a.name.should.eql('alice');
    done();
  });
  it('says extended hello', function(done) {
    var a = new animal.Dog('alice', 'Australian Shepherd');
    a.sayExtendedHello().should.eql('Hello from alice, Australian Shepherd');
    done();
  });
  it('barks', function(done) {
    var a = new animal.Dog('alice', 'Australian Shepherd');
    a.bark().should.eql('Woof!');
    done();
  });
  it('makes noise', function(done) {
    var a = new animal.Dog('alice', 'Australian Shepherd');
    a.makeNoise().should.eql('Woof!');
    done();
  });
});
