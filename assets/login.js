var app = new Vue({
  el: "#app",
  data() {
    return {
      invalidCredentials: false,
      code: "",
    };
  },
  methods: {
    onSubmit() {
      window.location.href = "/joinSession?code=" + app.code;
    },
  },
});
