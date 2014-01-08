/**
 * Module dependencies.
 */

var express = require('express')
, routes = require('./routes')
, http = require('http')
, path = require('path')
, sqlite = require('sqlite3').verbose()
, ripple = require('ripple-lib')
, config = require('./config.json')
, Notifier = require('./notifier').Notifier;

var app = express();

// all environments
app.set('port', process.env.PORT || 58305);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

var db = new sqlite.Database(path.resolve(__dirname, 'data.db'));
db.serialize();

db.run("CREATE TABLE IF NOT EXISTS subscriptions (type TEXT, key TEXT, ripple_address TEXT)");

var notifier = new Notifier();

db.each("SELECT type, key, ripple_address AS address FROM subscriptions", function(err, row) {
  if (err) {
    failure(err);
    return;
  }

  if (row.address) {
    console.log("Resubscribing "+row.address+" => "+row.type+":"+row.key);
    notifier.subscribe(row.address, row.key, row.type);
  }
});

// development only
if ('development' == app.get('env')) {
    app.use(express.errorHandler());
}

var success = function(data) { console.log('success',data); };
var failure = function(data) { console.log('failure',data); };

app.get('/', function(req,res){
  res.render('index', {
    title: 'Ripple Notifier'
  });
  res.end();
});


app.get('/key/:key', function(req, res){
  var request = require('request');
  request.post('https://api.pushover.net/1/users/validate.json', {form:{
    token: config.PUSHOVER_TOKEN,
    user: req.params.key
  }}, function (err, response, body) {
    if (!err) {
      if (response.statusCode === 200 && JSON.parse(body).status === 1) {
        db.all('SELECT ripple_address AS address FROM subscriptions ' +
               'WHERE `type` = "pushover" AND key = ?',
               req.params.key,
               function (err, rows) {
                 if (err) {
                   console.error(err);
                   res.send(200, "Error from database");
                   return;
                 }

                 var addresses = rows.map(function (row) {
                   return row.address;
                 });

                 res.render('manage', {
                   title: 'Manage your subscriptions',
                   addresses: addresses,
                   pushover_key: req.params.key
                 });
                 res.end();
               });
      } else if (response.statusCode === 400) {
        res.render('index', {
          title: 'Ripple Notifier',
          key_error: JSON.parse(body).errors[0] || 'This is not a valid Pushover user key'
        });
        res.end();
      } else {
        res.render('index', {
          title: 'Ripple Notifier',
          key_error: 'This is not a valid Pushover user key'
        });
        res.end();
      }
    } else {
      // XXX Error
      console.error(err);
      res.send(200, "No response from Pushover");
    }
  });
});

app.post('/subscriptions/pushover/create', function(req, res) {
  if ("string" !== typeof req.body.ripple_address) {
    throw new Error("No ripple_address provided!");
  }
  var ripple_address = ripple.UInt160.from_json(req.body.ripple_address.trim());
  if (!ripple_address.is_valid()) {
    throw new Error("Invalid ripple_address!");
  }
  ripple_address = ripple_address.to_json();
  if ("string" !== typeof req.body.pushover_key) {
    throw new Error("No pushover_key provided!");
  }
  var pushover_key = req.body.pushover_key;

  db.get('SELECT key, ripple_address AS address FROM subscriptions'
         + ' WHERE type = "pushover" AND key = ? AND ripple_address = ?',
         pushover_key, ripple_address,
         function (err, row) {
           if (!row) {
             notifier.subscribe(ripple_address, pushover_key, "pushover");
             db.run('INSERT INTO subscriptions (type, ripple_address, key)'
                    + ' VALUES ("pushover", ?, ?)',
                    ripple_address, pushover_key);
             res.json({success: true});
           } else {
             res.send(200, {error: "Subscription already exists"});
           }
         });
});

app.post('/subscriptions/pushover/delete', function(req, res) {
  if ("string" !== typeof req.body.ripple_address) {
    throw new Error("No ripple_address provided!");
  }
  var ripple_address = ripple.UInt160.from_json(req.body.ripple_address.trim());
  if (!ripple_address.is_valid()) {
    throw new Error("Invalid ripple_address!");
  }
  ripple_address = ripple_address.to_json();
  if ("string" !== typeof req.body.pushover_key) {
    throw new Error("No pushover_key provided!");
  }
  var pushover_key = req.body.pushover_key;

  db.get('DELETE FROM subscriptions WHERE type = "pushover" AND ' +
         'key = ? AND ripple_address = ?',
         pushover_key, ripple_address,
         function (err, row) {
           if (err) {
             res.send(200, {error: "Error"});
           } else {
             notifier.unsubscribe(ripple_address, pushover_key, "pushover");
             res.json({success: true});
           }
         });
});

app.post('/subscriptions/apn/create', function(req, res) {
  if ("string" !== typeof req.body.ripple_address) {
    throw new Error("No ripple_address provided!");
  }
  var ripple_address = ripple.UInt160.from_json(req.body.ripple_address.trim());
  if (!ripple_address.is_valid()) {
    throw new Error("Invalid ripple_address!");
  }
  ripple_address = ripple_address.to_json();
  if ("string" !== typeof req.body.udid) {
    throw new Error("No UDID provided!");
  }
  var udid = req.body.udid;
  udid = udid.replace(/\s/g, '').replace(/^<|>$/g, '');

  if (!/^[a-f0-9]{64}$/i.exec(udid)) {
    throw new Error("Invalid UDID, should be 64 characters hex!");
  }

  var endpoint = req.query.sandbox ? "apnd" : "apn";

  db.get('SELECT key, ripple_address AS address FROM subscriptions'
         + ' WHERE type = ? AND key = ? AND ripple_address = ?',
         endpoint, udid, ripple_address,
         function (err, row) {
           if (!row) {
             notifier.subscribe(ripple_address, udid, endpoint);
             db.run('INSERT INTO subscriptions (type, ripple_address, key)'
                    + ' VALUES (?, ?, ?)',
                    endpoint, ripple_address, udid);
             res.json({success: true});
           } else {
             res.send(200, {error: "Subscription already exists"});
           }
         });
});

app.post('/subscriptions/apn/delete', function(req, res) {
  if ("string" !== typeof req.body.ripple_address) {
    throw new Error("No ripple_address provided!");
  }
  var ripple_address = ripple.UInt160.from_json(req.body.ripple_address.trim());
  if (!ripple_address.is_valid()) {
    throw new Error("Invalid ripple_address!");
  }
  ripple_address = ripple_address.to_json();
  if ("string" !== typeof req.body.udid) {
    throw new Error("No UDID provided!");
  }
  var udid = req.body.udid;
  udid = udid.replace(/\s/g, '').replace(/^<|>$/g, '');

  if (!/^[a-f0-9]{64}$/i.exec(udid)) {
    throw new Error("Invalid UDID, should be 64 characters hex!");
  }

  var endpoint = req.query.sandbox ? "apnd" : "apn";

  db.get('DELETE FROM subscriptions WHERE type = ? AND ' +
         'key = ? AND ripple_address = ?',
         endpoint, udid, ripple_address,
         function (err, row) {
           if (err) {
             res.send(200, {error: "Error"});
           } else {
             notifier.unsubscribe(ripple_address, udid, endpoint);
             res.json({success: true});
           }
         });
});

http.createServer(app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
});
