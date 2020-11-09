var uid = new String(
  new Date().getTime() + new Date().getUTCMilliseconds()
).substr(8, 13);

var pathParams = window.location.pathname.split("/");
var rid = pathParams[3] + ":" + pathParams[2];
var mode = pathParams[2];

var exercise = {
  problem:
    "Write a JavaScript code that returns the sum of the multiples of 3 and 5 under 1000",
  solution: 233168,
  code:
    "var sum = 0;\nfor (var x = 0; x < 1000; x++)\n{\n    if (x % 3 === 0 || x % 5 === 0)\n    {\n       sum += x;\n    }\n}\nreturn sum;",
};

var flask;
var socket;
var controlling;

function toJSON(obj) {
  return JSON.stringify(obj, null, 2);
}

function pack(data) {
  return {
    rid: rid,
    uid: uid,
    token: localStorage.token,
    data: data,
  };
}

function setup() {
  var server = "http://localhost:3000/";
  socket = io.connect();
  console.log("Connected with websocket to server " + server);

  socket.emit("registry", pack(new Date().getTime()));
  $("#status").val("Registring...");

  flask = new CodeFlask("#text", {
    language: "js",
    lineNumbers: true,
  });

  var lastReceived = "";

  $("#problem").text(exercise.problem);

  socket.on("text", (pack) => {
    console.log("text event triggered with data <" + toJSON(pack) + "> ");
    if (pack.uid != uid && pack.rid == rid) {
      lastReceived = pack.data;
      flask.updateCode(pack.data);
      console.log("  --> Updating code!");
    } else {
      console.log("  --> Ignored!");
    }
  });

  socket.on("msg", (pack) => {
    console.log(
      "msg event triggered with data <" +
        toJSON(pack) +
        "> in room <" +
        pack.rid +
        "> "
    );

    if (pack.uid != uid && pack.rid == rid) {
      console.log("  --> Adding msg to chat!");
      newMsg("grey", pack.uid, pack.data);
    } else {
      console.log("  --> ignored");
    }
  });

  if (mode == "controlled") {
    controlling = true;

    $("#controlBtn").removeClass("hidden");

    socket.on("giveControl", (pack) => {
      console.log(
        "giveControl event triggered with data <" +
          toJSON(pack) +
          "> in room <" +
          pack.rid +
          "> "
      );

      if (pack.uid == uid && pack.rid == rid) {
        console.log("  --> Disabling writing on this side!");
        $("#controlBtn").text("No control");
        $("#controlBtn").attr("disabled", true);
        flask.enableReadonlyMode();
        controlling = false;
      } else {
        console.log("  --> Enabling writing on this side!");
        flask.disableReadonlyMode();
        $("#controlBtn").text("Give control");
        $("#controlBtn").attr("disabled", false);
        controlling = true;
      }
    });
  }

  flask.onUpdate((data) => {
    clearResult("none");
    console.log("Code updated:");
    if (data != lastReceived) {
      socket.emit("text", pack(data));
      console.log(
        "  --> Emitting text event with data <" + toJSON(pack(data)) + "> "
      );
    } else {
      console.log(
        "  --> Text updated from external source: no event to be emitted"
      );
    }
  });

  socket.on("userRegistered", (pack) => {
    console.log(
      "userRegistered event triggered with data <" +
        toJSON(pack) +
        "> in room <" +
        pack.rid +
        "> "
    );

    if (pack.rid == rid) {
      if (pack.uid == uid) {
        console.log("  --> Updating code");
        lastReceived = pack.data;
        flask.updateCode(pack.data);
      } else {
        console.log("--> Show message of new peer <" + pack.uid + ">");
        alert("New peer: " + uid);
      }
    } else {
      console.log("  --> ignored");
    }
  });

  socket.on("newMsg", (pack) => {
    console.log("newMsg event triggered with data <" + toJSON(pack) + "> ");
  });
}

$(document).ready(function () {
  var roomprefix = window.location.pathname.substring(1, 6);
  if (roomprefix != "rooms" || rid == undefined || rid == "") {
    $("body").text("Invalid URL!");
    return 0;
  }

  setup();
  console.log("JQuery ready!");

  $(window).bind("keydown", function (event) {
    if (event.ctrlKey || event.metaKey) {
      switch (String.fromCharCode(event.which).toLowerCase()) {
        case "s":
          event.preventDefault();
          validate();
          break;
        case "l":
          event.preventDefault();
          flask.updateCode(exercise.code);
          break;
      }
    }
  });

  $("#input-msg").keydown(function (e) {
    if (e.ctrlKey && e.keyCode == 13) {
      var msg = $("#input-msg").val();

      newMsg("red", uid, msg);

      $("#input-msg").val("");
      console.log("Submiting chat message!");

      socket.emit("msg", pack(msg));
    }
  });
});

function newMsg(color, name, msg) {
  var liFragment =
    '<li class="collection-item avatar small" style="min-height: 60px;">\
                        <i class="material-icons circle ' +
    color +
    '">face</i> \
                        <span class="chat-name">' +
    name +
    '</span> \
                        <div class="chat-msg">' +
    msg +
    "</div> \
                    </li>";

  $("#chat").append(liFragment);

  // Scroll to the end
  document.getElementById("rightArea").scrollTop = document.getElementById(
    "help-submit-chat"
  ).offsetTop;
}

function moveHelp() {
  currentMsg = $("#input-msg").val();
  if (currentMsg == "Write message here and press CTRL+ENTER") {
    $("#input-msg").val("");
    $("#help-submit-chat").css("display", "block");
  }
}

function clearResult(display) {
  $("#return").text("");
  $("#return").css("display", display);
  $("#result").text("");
  $("#result").css("display", display);
}

function validate() {
  clearResult("block");

  var code = flask.getCode();
  var fullcode = "function test(){" + code + "}; var ret=test();";
  try {
    eval(fullcode);
    if (ret) {
      $("#return").text(ret);
      if (valid(ret)) {
        $("#result").text("CORRECT");
        $("#result").css({
          color: "green",
          "font-size": "150%",
        });
      } else {
        $("#result").text("INCORRECT");
        $("#result").css({
          color: "red",
          "font-size": "100%",
        });
      }
    } else {
      $("#return").text("NO DATA RETURNED");
    }
  } catch (e) {
    $("#return").text(e);
  }
}

function valid(v) {
  return v === exercise.solution;
}

function toggleControlMode() {
  if (controlling) {
    console.log("Letting control to the other party!");
    socket.emit("giveControl", pack(""));
  }
}
