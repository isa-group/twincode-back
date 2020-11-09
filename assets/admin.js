var socket = io("/");
Vue.use(VueSocketIOExt, socket);

var app = new Vue({
  el: "#app",
  data() {
    return {
      invalidCredentials: false,
      code: "",
    };
  },
  methods: {
    startDebugSession() {
      console.log("Starting debug session...");
      app.$socket.client.emit("startDebugSession");
    },
  },
});
