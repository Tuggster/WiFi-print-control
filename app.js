// Declerations
var serialport = require("serialport");

const express = require('express');
const app = express();
const cors = require(`cors`);
var serveStatic = require('serve-static')

var sdState = 0;
var sdInserted = false;
var lastSDMessage = "";

var port = new serialport("\\\\.\\COM14", {
  baudRate: 250000
});

let msgQueue = [];
let allowingQueue = false;


app.use(cors());
app.use(express.static(`static`))

let lastSentMessage = "";
let lastRecievedMessage = "";
let lastParsedMessage = {
  args: {},
  keys: {},
  vals: {}
};

let temp1 = 0;
let temp2 = 0;
let target1 = 0;
let target2 = 0;

let printPercent = 0;

let tempInterval = 15; // Find temps every 15 seconds
let printInterval = 120; // Find print status every 120 seconds

setInterval(function() {
  sendSerialData(`M105`);
}, tempInterval * 1000);

setInterval(function() {
  sendSerialData(`M27`);
}, printInterval * 1000);


port.open(function(err) {
  if (err) {
    return console.log('Error opening port: ', err.message);
  }
});

port.on('open', function() {
  console.log(`Opened serial connection!`);

  setTimeout(function() {
    sendSerialData(`M27`);
  }, 3000);

  setTimeout(function() {
    sendSerialData(`M105`);
  }, 1000);
});

port.on('readable', function () {
  let data = port.read();
  let pdata;
  let rawData = data.toString('utf8');
  console.log(rawData);
  parseData(rawData);
  lastRecievedMessage = rawData;
});

function parseData(data) {

  if (!data || data == "")
    return -1;

  if (data.startsWith('ok')) { // OK response handling
    return getDataArgs(data);
    console.log(`Parsed args from ${data}`);
  }

  if (data.startsWith('echo')) { // ECHO response handling
    return data.slice(`echo:`.length);
    if (data.startsWith(`SD card ok`)) {
      sdInserted = true;
      return console.log(`SD card found!`);
    }
  }

  if (data.startsWith(`SD printing byte `)) {
    let bytes = data.slice(`SD printing byte `.length).split(`/`);
    printPercent = map_range(bytes[0], 0, bytes[1], 0, 100);
    console.log(`Percentage: ${printPercent}`);
  }
}



// Serial processing:

//Function Declerations
function sendSerialData(message) {
  try {
    port.write(message+`\n`);
    lastSentMessage = message;
  } catch (e) {
    lastSentMessage = `ERROR: serial send error.`
    console.warn(`can't send data!`);
  }
}

function getDataArgs(data) {
  let out = {
    args: {},
    keys: {},
    vals: {}
  }
  if (data.length > 0) {
    let args = data.split(` `);
    args.shift();
    let keys = [];
    let vals = [];

    for (let i = 0; i < args.length; i++) {
      let arg = args[i].split(`:`);
      keys.push(arg[0]);
      vals.push(arg[1]);
      console.log(`Key: ${arg[0]}, Value: ${arg[1]}`)
    }
    out.args = args;
    out.keys = keys;
    out.vals = vals;
  }

  if (out.keys[0] == `T` && out.keys[2] == `B` && out.keys[4] == `@`) {
    temp1 = out.vals[0];
    temp2 = out.vals[2];
    target1 = out.keys[1].slice(1);
    target2 = out.keys[3].slice(1);
  }

  lastParsedMessage = out;
  return out;
}

let tempargs = ["T", "/", "B", "/", "@", "B@", "M105"];
let posargs = ["X", "Y", "Z", "E", "M114"]

let gcodereturns = [tempargs, posargs];

function findCode(data) { // WARNING: Broken!
  for (var i = 0; i < data.length; i++) {
    for (var j = 0; j < gcodereturns.length; j++) {
      if (gcodereturns[j] != undefined && j < gcodereturns.length - 2)
        if (data.keys[i] != gcodereturns[j][i]) {
          continue;
        } else if (j == gcodereturns[j].length-2) {
           return gcodereturns[gcodereturns.length - 1];
        }
    }

  }
  return `unk`;
}

// init().catch(function(e) {
//   console.warn(e);
// });

//EXPRESS WEBSERVER
app.get('/', function(req, res) {

  if (req.query.fetch == `gettemp`) {
    //if (console.log(findCode(lastParsedMessage)) == `M105`) {

    if (req.query.force == `true`) {
      sendSerialData(`M105`);
    }

    let obj = {
      hotend: temp1,
      bed: temp2,
      hotend_target: target1,
      bed_target: target2
    }
    res.send(JSON.stringify(obj));
    //}
  } else if (req.query.fetch == `getprintstatus`) {
    if (req.query.force != undefined) {
      console.log(`FORCED RELOAD!`);
      sendSerialData(`M27`);
    }

    let obj = {
      percent: printPercent,
      cardinserted: sdInserted
    }

    res.send(JSON.stringify(obj));
  } /*else if (req.query.fetch == `getpos`) {
    sendSerialData(`M114`); //M105 is marlin gcode to return temps
    //if (findCode(lastParsedMessage) == `M114`) {
      let obj = {
        x: lastParsedMessage.vals[0],
        y: lastParsedMessage.vals[1],
        z: lastParsedMessage.vals[2],
        e: lastParsedMessage.vals[3]
      }

      res.send(JSON.stringify(obj));
    //}
  } */else {
    res.send(`invalid fetch!`);
  }
  console.log(`We've got a connection!`);
})

function map_range(value, low1, high1, low2, high2) {
  return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
}

app.listen(3000);
