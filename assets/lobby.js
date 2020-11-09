var app = new Vue({
  el: "#app",
  data() {
    return {
      invalidToken: false,
      waitingForPeer: false,
      tokenId: "",
    };
  },
  sockets: {
    sessionStart(val) {
      window.location.href = "/rooms/controlled/" + val.room;
    },
  },
  methods: {
    onSubmit() {
      fetch("/registerUser", {
        method: "POST",
        body: JSON.stringify({ tokenId: app.tokenId }),
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      }).then(function (response) {
        if (response.status == 200) {
          app.$socket.client.emit("clientReady", app.$cookies.get("code"));
          localStorage.setItem("token", app.$cookies.get("code"));
          app.waitingForPeer = true;
        } else if (response.status == 404) {
          app.invalidToken = true;
        }
      });
    },
  },
});
