import Message from "./components/Message.js";
Vue.use(VueCodemirror);

var app = new Vue({
  el: "#app",
  data() {
    return {
      code: `return 0;\n`,
      cmOption: {
        tabSize: 4,
        styleActiveLine: true,
        lineNumbers: true,
        mode: "text/javascript",
      },
      myMessage: "",
      uid: "",
      rid: "",
      lastReceived: "",
      exerciseDescription: "Please, wait until the exercise loads...",
      exerciseLoaded: false,
      exerciseType: "PAIR",
      testDescription: "",
      finished: false,
      starting: true,
      loadingTest: false,
      peerChange: false,
      timeInterval: null,
      maxTime: 0,
      timePassed: 0,
      isExerciseCorrect: null,
    };
  },
  filters: {
    secondsToString: function (value) {
      const minutes = Math.floor(value / 60);
      const seconds = value - minutes * 60;

      return `${minutes}:${("0" + seconds).slice(-2)}`;
    },
  },
  sockets: {
    msg(pack) {
      if (pack.uid != this.uid && pack.rid == this.rid) {
        console.log(
          "newMsg event triggered with data <" + this.toJSON(pack) + "> "
        );
        this.newMessage(pack.data, false);
      }
    },
    text(pack) {
      console.log(
        "text event triggered with data <" + this.toJSON(pack) + "> "
      );
      if (pack.uid != this.uid && pack.rid == this.rid) {
        this.lastReceived = pack.data;
        this.code = pack.data;
        console.log("  --> Updating code!");
      } else {
        console.log("  --> Ignored!");
      }
    },
    finish() {
      this.finished = true;
    },
    loadTest(pack) {
      this.finished = false;
      this.loadingTest = true;
      this.starting = false;
      this.testDescription = pack.data.testDescription;
      this.peerChange = !this.peerChange;
      this.$refs.messageContainer.innerHTML = "";
    },
    newExercise(pack) {
      this.loadingTest = false;
      this.maxTime = pack.data.maxTime;
      this.timePassed = 0;
      this.isExerciseCorrect = null;
      this.$refs.progressBar.style.width = "100%";
      this.$refs.progressBar.classList.remove("bg-red-500");
      this.$refs.progressBar.classList.add("bg-green-500");
      this.exerciseDescription = pack.data.exerciseDescription;
      this.exerciseType = pack.data.exerciseType;
    },
    reconnect() {
      this.$socket.client.emit("clientReconnection", localStorage.token);
    },
    countDown(pack) {
      this.timePassed = this.maxTime - pack.data;
      console.log("Counting down!");
      let factor = 100 / this.maxTime;
      let width = parseFloat(this.$refs.progressBar.style.width, 10) - factor;
      this.$refs.progressBar.style.width = width + "%";
      if (width < 20) {
        this.$refs.progressBar.classList.remove("bg-yellow-500");
        this.$refs.progressBar.classList.add("bg-red-500");
      } else if (width < 40) {
        this.$refs.progressBar.classList.remove("bg-green-500");
        this.$refs.progressBar.classList.add("bg-yellow-500");
      }
    },
  },
  created() {
    var pathParams = window.location.pathname.split("/");
    this.rid = pathParams[3] + ":" + pathParams[2];

    this.uid = new String(
      new Date().getTime() + new Date().getUTCMilliseconds()
    ).substr(8, 13);

    this.$socket.client.emit("clientReconnection", localStorage.token);
  },
  watch: {
    code: function (newVal, oldVal) {
      this.clearResult();
      console.log("Code updated:");
      if (newVal != this.lastReceived) {
        this.$socket.client.emit("text", this.pack(newVal));
        console.log(
          "  --> Emitting text event with data <" +
            this.toJSON(this.pack(newVal)) +
            "> "
        );
      } else {
        console.log(
          "  --> Text updated from external source: no event to be emitted"
        );
      }
    },
  },
  methods: {
    sendMessage() {
      if (this.exerciseType == "PAIR") {
        this.newMessage(this.myMessage, true);
        this.$socket.client.emit("msg", this.pack(this.myMessage));

        this.myMessage = "";
      }
    },
    newMessage(msg, mine) {
      const MessageClass = Vue.extend(Message);
      const msgInstance = new MessageClass({
        propsData: {
          mine: mine,
          message: msg,
          girl: this.peerChange,
        },
      });

      msgInstance.$mount();
      this.$refs.messageContainer.appendChild(msgInstance.$el);

      var container = this.$refs.messageContainer;
      container.scrollTop = container.scrollHeight;
    },
    validate() {
      this.clearResult("block");
      try {
        const ret = this.evaluateCode(this.code);
        if (ret) {
          this.valid(ret);
        }
      } catch (e) {
        console.log("ERROR HERE: ", e);
      }
    },
    valid(v) {
      fetch("/verify", {
        method: "POST",
        body: JSON.stringify({
          solution: v,
          user: Number(localStorage.token),
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }).then(function (response) {
        if (response.status == 200) {
          response.json().then((data) => {
            app.isExerciseCorrect = data.result;
          });
        }
      });
    },
    clearResult() {
      console.log("Clearing result!");
    },
    onCmBlur(cm) {
      console.log("cm blur!", cm);
    },
    onCmFocus(cm) {
      console.log("cm focus!", cm);
    },
    onCmReady(cm) {
      console.log("cm ready!", cm);
    },
    loadExercise() {
      this.onTimesUp();
      fetch("/test?code=" + localStorage.token, {
        method: "GET",
      }).then(function (response) {
        if (response.status == 200) {
          response.json().then((data) => {
            if (data.finished) {
              window.location.href = "/finished";
            } else {
              app.exerciseDescription = data.description;
              app.maxTime = data.time;
              app.startTimer();
            }
          });
        }
      });
    },
    pack(data) {
      return {
        rid: this.rid,
        uid: this.uid,
        token: localStorage.token,
        data: data,
      };
    },
    toJSON(obj) {
      return JSON.stringify(obj, null, 2);
    },
    evaluateCode(code) {
      return Function('"use strict";' + code)();
    },
  },
  computed: {
    cm() {
      return this.$refs.cm.codemirror;
    },
  },
  mounted() {
    console.log("the codemirror instance object", this.cm);
    //this.loadExercise();
    this.$refs.progressBar.style.width = `${
      ((this.maxTime - this.timePassed) / this.maxTime) * 100
    }%`;
  },
});
