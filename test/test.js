var chai = require('chai');
var assert = chai.assert;
var should = chai.should();
var expect = chai.expect;

// TODO Comprobar rutas del back-end
describe('Testing assert function: ', function() {
  describe('Check addTest Function', function(){
    it('Check the returned value using : assert.equal(value, value): ', function() {
       result = 2;
       assert.equal(result, 2);
    });
  });
})

describe('Testing should function: ', function() {
    describe('Check addTest Function', function(){
      it('Check the returned value using : result.should.be.equal(value): ', function() {
         result = 2;
         result.should.be.equal(2);
      })
    })
  })

  describe('Testing expect function: ', function() {
    describe('Check addTest Function', function(){
      it('Check the returned value using : expect(result).to.be.a(value);: ', function() {
         result = 2;
          expect(result).to.equal(3);
      })
    })
  })