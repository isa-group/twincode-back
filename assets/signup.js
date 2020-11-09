var app = new Vue({
  el: "#app",
  data() {
    return {
      errors: [],
      invalidCredentials: false,
      details: {
        firstName: "",
        surname: "",
        mail: "",
        academicMail: "",
        gender: null,
        birthDate: null,
        subject: "",
        beganStudying: null,
        numberOfSubjects: null,
        knownLanguages: "",
      },
      submitionOk: false,
    };
  },
  methods: {
    checkForm(e) {
      if (
        app.details.firstName &&
        app.details.surname &&
        app.details.mail &&
        app.details.gender &&
        app.details.birthDate &&
        app.details.subject &&
        app.details.beganStudying &&
        app.details.numberOfSubjects &&
        app.details.knownLanguages &&
        app.dateValid()
      ) {
        this.errors = [];
        return this.onSubmit();
      }

      this.errors = [];

      if (!app.details.firstName) {
        this.errors.push("First name required.");
      }
      if (!app.details.surname) {
        this.errors.push("Surname required.");
      }
      if (!app.details.mail) {
        this.errors.push("Mail required.");
      }
      if (!app.details.gender) {
        this.errors.push("Gender required.");
      }
      if (!app.details.birthDate) {
        this.errors.push("Date of birth required.");
      }
      if (!app.details.subject) {
        this.errors.push("Subject required.");
      }
      if (!app.details.beganStudying) {
        this.errors.push("Year of first enrollement required.");
      }
      if (!app.details.numberOfSubjects) {
        this.errors.push("Number of subjects this year required.");
      }
      if (!app.details.knownLanguages) {
        this.errors.push("Known languages is required.");
      }

      e.preventDefault();
    },
    onSubmit() {
      fetch("/signup", {
        method: "POST",
        body: JSON.stringify(app.details),
        headers: {
          "Content-Type": "application/json",
        },
      }).then((response) => {
        if (response.status === 200) {
          app.submitionOk = true;
        } else {
          app.errors.push("There was an error in the request. Check the form.");
        }
      });
    },
    dateValid() {
      // Because <input type="date" /> behaves differently in safari
      // This check is necesary
      const date = new Date(app.details.birthDate);
      if (date == "Invalid Date") {
        // Safari
        let dateArray = app.details.birthDate.split("/");
        app.details.birthDate = new Date(
          `${dateArray[2]}-${dateArray[1]}-${dateArray[0]}`
        );
        console.log(app.details.birthDate);
      } else {
        app.details.birthDate = date;
      }

      if (app.details.birthDate == "Invalid Date") {
        this.errors.push("Please enter a valid date in your birth date.");
      }

      return app.details.birthDate != "Invalid Date";
    },
  },
});
