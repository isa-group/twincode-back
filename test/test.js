let chai = require('chai');
let chaiHttp = require('chai-http');
var assert = chai.assert;
var should = chai.should();
var expect = chai.expect;
const axios = require("axios");

chai.use(chaiHttp);
var localHostURL = "http://localhost:3000";

// TODO Comprobar rutas del back-end

console.log('Testing back-end routes: ');
// ADMIN
describe('./admin.js', function() {


  // ADMIN --> SESSIONS
  describe('Sessions', function(){


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


      it('Session status must be active', (done) => {
        chai.request(localHostURL)
        .get('/status/Test Session')
        .send()
        .set('Authorization', '300OT0n3l4d45')
        .end( function(err,res){
          expect(res).to.have.status(200);
          expect(res.body.exists).to.eql(true);
          done();
        });
      });
      

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


      it('ToggleActivation in session must change', (done) => {chai.request(localHostURL)
        .put('/sessions/Test Session/toggleActivation')
        .send({
          name: "Test Session"
        })
        .set('Authorization', '300OT0n3l4d45')
        .end( function(err,res){
          expect(res).to.have.status(200);
          expect(res.body.active).to.eql(true);
          done();
        });
      });


      it('ToggleActivation in session must change again', (done) => {          
        chai.request(localHostURL)
        .put('/sessions/Test Session/toggleActivation')
        .send({
          name: "Test Session"
        })
        .set('Authorization', '300OT0n3l4d45')
        .end( function(err,res){
          expect(res).to.have.status(200);
          expect(res.body.active).to.eql(false);
          done();
        });
      });
      


      it('Editing a session must be 200 and tokens has changed', (done) => {
        chai.request(localHostURL)
        .put('/sessions/Test Session')
        .send({
          "tokens": ["one", "two"]
        })
        .set('Authorization', '300OT0n3l4d45')
        .end( function(err,res){
          expect(res.body.tokens).to.eql(["one", "two"]);
          expect(res).to.have.status(200);
          done();
        });
      });


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


  // ADMIN --> TESTS
  describe('Tests', function(){


    it('Creating a test must be 200', (done) => {
      chai.request(localHostURL)
        .post('/sessions')
        .set('Authorization', '300OT0n3l4d45')
        .send({
          name: "Test sessions",
          tokenPairing: false,
          tokens: ["uno"]
        })
        .end( function(err,res){
        });

      chai.request(localHostURL)
      .post('/tests')
      .send({
        session: "Test sessions",
        name: "Testing test",
        description: "Description test",
        orderNumber: 1,
        time: 50,
        peerChange: true,
        exercises: []
      })
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });
    });


    it('Get all tests in a session must be 200', (done) => {
      chai.request(localHostURL)
      .get('/tests/Test sessions')
      .set('Authorization', '300OT0n3l4d45')
      .send()
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });
    });


    it('Get a test in a session must be 200', (done) => {
      chai.request(localHostURL)
      .get('/tests/Test sessions/1')
      .set('Authorization', '300OT0n3l4d45')
      .send()
      .end( function(err,res){
        console.log(res.body)
        expect(res).to.have.status(200);
        done();
      });
    });


    it('Editing a test must be 200', (done) => {
      chai.request(localHostURL)
      .put('/tests/Test Session')
      .send({
        "orderNumber": 1,
        "time": 120,
        "exercises": []
      })
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });
    });


    it('Deleting a test must be 200', (done) => {
      chai.request(localHostURL)
      .delete('/tests/Test sessions/1')
      .send({
        name: "Test sessions"
      })
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });

    
      chai.request(localHostURL)
      .delete('/sessions/Test sessions')
      .send({
        name: "Test sessions"
      })
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
      });
    
    });


  });



  // ADMIN --> EXERCISES
  describe('Exercises', function(){


    it('Creating a test must be 200', (done) => {
      chai.request(localHostURL)
        .post('/sessions')
        .set('Authorization', '300OT0n3l4d45')
        .send({
          name: "Test sessions",
          tokenPairing: false,
          tokens: ["uno"]
        })
        .end( function(err,res){
        });

      chai.request(localHostURL)
      .post('/tests')
      .send({
        session: "Test sessions",
        name: "Testing test",
        description: "Description test",
        orderNumber: 1,
        time: 50,
        peerChange: true,
        exercises: [{
          "name": "Exercise 1",
          "description": "This is a testing exercise",
          "validations": [{
            "input": 1,
            "solution": 2
          },{
            "input": 10,
            "solution": 101
          },{
            "input": 5,
            "solution": 26
          },{
            "input": 73,
            "solution": 5330
          }]
        }]
      })
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });
    });


    
    it('Getting an exercise from a test must be 200', (done) => {
      chai.request(localHostURL)
      .get('/tests/Testing test/exercise/0')
      .send()
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });
    });
    

    it('Deleting a test must be 200', (done) => {
      chai.request(localHostURL)
      .delete('/tests/Test sessions/1')
      .send({
        name: "Test sessions"
      })
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });

    
      chai.request(localHostURL)
      .delete('/sessions/Test sessions')
      .send({
        name: "Test sessions"
      })
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
      });
    
    });


  });



}); 

// PARTICIPANS
describe('./participants.js', function() {


  // PARTICIPANS --> PARTICIPANS
  describe('Participants', function(){

    /*
    it('Deleting a test must be 200', (done) => {
      chai.request(localHostURL)
      .delete('/tests/Test sessions/1')
      .send({
        name: "Test sessions"
      })
      .set('Authorization', '300OT0n3l4d45')
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });
    
    });
    */

  });



}); 


// AUTH
describe('./auth.js', function() {


  // AUTH --> PARTICIPANS
  describe('Participants', function(){

    //Using one of the local session created (if doesn't exists change the code)
    it('Logging must be 200', (done) => {
      chai.request(localHostURL)
      .post('/login')
      .send({
        "code": "952555"
      })
      .end( function(err,res){
        expect(res.body.found).to.eql(true);
        expect(res.body.code).to.eql("952555");
        expect(res).to.have.status(200);
        done();
      });
    });

    // TODO lo inserta en mongo pero devuelve error 500
    it('Singing up must be 200', (done) => {
      chai.request(localHostURL)
      .post('/signup')
      .send({
        firstName: 'David',
        surname: 'Brincau',
        mail: 'dbrincau@us.es',
        academicMail: '',
        gender: 'Male',
        jsexp: '4',
        birthDate: '2000-08-24T00:00:00.000Z',
        subject: 'Session1',
        beganStudying: '2018',
        numberOfSubjects: '9',
        knownLanguages: 'python'
      })
      .end( function(err,res){
        expect(res).to.have.status(200);
        done();
      });
    });
    

  });



}); 

