const fs = require('fs');
const cors = require('cors');
const readline = require('readline');
const { google } = require('googleapis');
var express = require('express');
var bodyParser = require('body-parser')

var app = express();
app.use(cors());

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */

function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the next 10 events on the user's primary calendar.
  @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

var tabEvents = [];

function listEvents(auth, min, max, callback) {
  const calendar = google.calendar({ version: 'v3', auth });
  tabEvents = [];
  calendar.events.list({
    calendarId: 'primary',
    timeMin: min.toString(),
    timeMax: max.toString(),
    maxResults: 12,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const events = res.data.items;
    if (events.length) {
      events.map((event, i) => {
        const start = event.start.dateTime || event.start.date;
        tabEvents.push(`${start} - ${event.end.dateTime} - ${event.summary} - ${event.description}`);
      });
      callback(tabEvents);
    } else {
      callback([]);
      console.log('No upcoming events found.');
    }
  });
}

/**
* Lists the next 10 events on the user's primary calendar.
@param {google.auth.OAuth2} auth An authorized OAuth2 client.
*/

app.post("/rezerwacja", (req, res) => {
  fs.readFile('credentials.json', (err, content) => {
    if (err) {
      return console.log('Error loading client secret file:', err);
    } else {

      // Authorize a client with credentials, then call the Google Calendar API.
      // authorize(JSON.parse(content), listEvents)

      authorize(JSON.parse(content), function (token) {
        listEvents(token, req.body.min, req.body.max, function (tab) {
          console.log("Json Callback Events: ", tab);
          // dla ladniejszej animacji w przegladarce
          setTimeout(function () { res.send(tab); }, 500);
        });
      });
    }
  });
});

function addEvents(req, auth, callback) {

  let hours_Duze_complite = group_tab(req.body.hours[0].godziny.sort(compareNumbers))
  let hours_Male_complite = group_tab(req.body.hours[1].godziny.sort(compareNumbers))
  const calendar = google.calendar({ version: 'v3', auth });
  let events = [];

  for (let i = 0; i < hours_Duze_complite.length; i++){
    events.push(rezerwationFinal(req, hours_Duze_complite[i], "Duże Boisko", 2))
  }

  for (let i = 0; i < hours_Male_complite.length; i++){
    events.push(rezerwationFinal(req, hours_Male_complite[i], "Male Boisko", 4))
  }

  (async function loop() {
    for (let i = 0; i < events.length; i++) {
      await new Promise(resolve => 
        calendar.events.insert({
          auth: auth,
          calendarId: 'primary',
          resource: events[i],
        }, function (err, event) {
          if (err) {
            console.log('There was an error contacting the Calendar service: ' + err);
            // callback("Błąd");
            // return;
          } else {
            console.log('Event created !');
            resolve();
            if(i === events.length-1){
              callback(); 
            }
          }
        })
      );
    }
  })();
}

function rezerwationFinal(req, value, summary, colorId, auth, callback) {
  var event = {
      'summary': summary,
      'colorId': colorId,
      'description': "<b> Imię: </b>" + req.body.name + "\n" + "<b> Telefon: </b>" + req.body.phone + "\n" + "<b> Wstęp: </b>" + req.body.wstep,
      'start': {
        'dateTime': req.body.day + "T" + Number(value[0]) + ":00:00+01:00",
        'timeZone': 'Europe/Warsaw',
      },
      'end': {
        'dateTime': req.body.day + "T" + (Number(value[0]) + value.length) + ':00:00+01:00',
        'timeZone': 'Europe/Warsaw',
      },
      'reminders': {
        'useDefault': false,
        'overrides': [
          { 'method': 'email', 'minutes': 12 * 60 }
        ],
      },
    };
  return event;
}

app.post("/rezerwacja/finalizacja", (req, res) => {
  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Calendar API.
    // authorize(JSON.parse(content), addEvents);
    authorize(JSON.parse(content), function (token) {
      addEvents(req, token, function (tab) {
        setTimeout(function () {
          res.end(JSON.stringify(tab));
        }, 1000);
      });
    });
  });
});

function compareNumbers(a, b) {
  return a - b
}

function group_tab(sort_tab) {
  var helper_tab = []
  var end_tab = []
  var prev_value
  var curr_value
  var next_value

  for (let i = 0; i < sort_tab.length; i++) {
    prev_value = sort_tab[i == 0 ? sort_tab.length - 1 : i - 1]
    curr_value = sort_tab[i]
    next_value = sort_tab[i == sort_tab.length - 1 ? 0 : i + 1]

    if (sort_tab.length != 1) {
      if (i == 0) {
        //First Element
        if (curr_value == next_value) {
          helper_tab.push(curr_value)
        } else if (curr_value + 1 == next_value) {
          helper_tab.push(curr_value)
        } else {
          helper_tab.push(curr_value)
          end_tab.push(helper_tab)
          helper_tab = []
        }
      } else if (i == sort_tab.length - 1) {
        //Last Element
        if (prev_value == curr_value) {
          helper_tab.push(curr_value)
          end_tab.push(helper_tab)
        } else if (prev_value + 1 == curr_value) {
          helper_tab.push(curr_value)
          end_tab.push(helper_tab)
        } else {
          //-----------HERE CHANGE-----------
          //Check if empty
          if (helper_tab.length > 0) {
            end_tab.push(helper_tab)
          }
          //-----------HERE CHANGE-----------
          helper_tab = []
          //If last element is single we add it here
          helper_tab.push(curr_value)
          end_tab.push(helper_tab)
        }
      } else {
        //Everything Else
        if (prev_value == curr_value) {
          helper_tab.push(curr_value)
        } else if (prev_value + 1 == curr_value) {
          helper_tab.push(curr_value)
        } else {
          if (typeof helper_tab !== 'undefined' && helper_tab.length > 0) {
            end_tab.push(helper_tab)
          }
          helper_tab = []
          helper_tab.push(curr_value)

        }
      }
    } else {
      helper_tab.push(curr_value)
      end_tab.push(helper_tab)
    }
  }
  return end_tab
}

app.listen(3000, function () {
  console.log("Listening at Port 3000");
});
