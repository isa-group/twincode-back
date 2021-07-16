let chai = require('chai');
let chaiHttp = require('chai-http');
var assert = chai.assert;
var should = chai.should();
var expect = chai.expect;
const axios = require("axios");

chai.use(chaiHttp);
var localHostURL = "http://localhost:3000";

// TODO Comprobar rutas del back-end

  describe('Testing back-end routes: ', function() {


    describe('./admin.js --> Sessions', function(){


      it('Get all sessions must be 200', (done) => {
        chai.request(localHostURL)
        .get('/sessions')
        .set('Authorization', '300OT0n3l4d45')
        .send()
        .end( function(err,res){
          expect(res).to.have.status(200);
          done();
        });
      });


        it('Post a new session must be 200', (done) => {
          chai.request(localHostURL)
          .post('/sessions')
          .set('Authorization', '300OT0n3l4d45')
          .send({
            name: "Test Session",
            tokenPairing: false,
            tokens: ["uno"]
          })
          .end( function(err,res){
            expect(res).to.have.status(200);
            done();
          });
        });


        it('Get a session must be 200', (done) => {
          chai.request(localHostURL)
          .get('/sessions/Test Session')
          .set('Authorization', '300OT0n3l4d45')
          .send()
          .end( function(err,res){
            expect(res).to.have.status(200);
            done();
          });
        });


        it('Get a session doesnt exists must be 404', (done) => {
          chai.request(localHostURL)
          .get('/sessions/Session doesnt exists')
          .set('Authorization', '300OT0n3l4d45')
          .send()
          .end( function(err,res){
            expect(res).to.have.status(404);
            done();
          });
        });


        it('Post a new session with bad credentials must be 401', (done) => {
          chai.request(localHostURL)
          .post('/sessions')
          .set('Authorization', 'an0th3rW0rd')
          .send({
            name: "Test Session",
            tokenPairing: false,
            tokens: ["uno"]
          })
          .end( function(err,res){
            expect(res).to.have.status(401);
            done();
          });
        }); 
 

        it('Starts session must be 200', (done) => {
          chai.request(localHostURL)
          .post('/startSession/Test Session')
          .send({
            name: "Test Session"
          })
          .set('Authorization', '300OT0n3l4d45')
          .end( function(err,res){
            expect(res).to.have.status(200);
            done();
          });
        });
 

        // TODO Averiguar que hace status y hacer el test correspondiente
        /*
        it('Session status must be active', (done) => {
          chai.request(localHostURL)
          .get('/status/Test Session')
          .send({
            name: "Test Session"
          })
          .set('Authorization', '300OT0n3l4d45')
          .end( function(err,res){
            console.log(res.body)
            done();
          });
        });
        */
       

        it('Resets session must be 200', (done) => {
          chai.request(localHostURL)
          .post('/resetSession')
          .send({
            name: "Test Session"
          })
          .set('Authorization', '300OT0n3l4d45')
          .end( function(err,res){
            expect(res).to.have.status(200);
            done();
          });
        });


        // TODO hacer funcionar este test
        /*
        it('ToggleActivation in session must change', (done) => {
          chai.request(localHostURL)
          .put('/resetSession/Test Session/toggleActivation')
          .send({
            name: "Test Session"
          })
          .set('Authorization', '300OT0n3l4d45')
          .end( function(err,res){
            console.log(res)
            done();
          });
        });
        */


        it('Deleting a session must be 200', (done) => {
          chai.request(localHostURL)
          .delete('/sessions/Test Session')
          .send({
            name: "Test Session"
          })
          .set('Authorization', '300OT0n3l4d45')
          .end( function(err,res){
            expect(res).to.have.status(200);
            done();
          });
        });


    });


  }); 

