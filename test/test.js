var chai = require('chai');
var assert = chai.assert;
var should = chai.should();
var expect = chai.expect;

var localHostURL = "http://localhost:3000";

// TODO Comprobar rutas del back-end

  describe('Testing back-end routes: ', function() {


    describe('./admin.js', function(){


      it('Test post works: ', function() {
        var session = {
          name: "Test Session",
          tokenPairing: false,
          tokens: ["uno"]
        }

        fetch(localHostURL+'/sessions', {
          method: "POST",
          headers: {
            Authorization: localStorage.adminSecret,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(session),
        }).then(response => {
          assert.strictEqual(response.status, 200);
        }).catch(err => {
          assert.fail('Error on request');
        });
      });


      it('Test 2 ', function() {
        assert.strictEqual(2,2);
      });


    });


  }); 

