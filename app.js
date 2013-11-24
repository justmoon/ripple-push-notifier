/**
 * Module dependencies.
 */

var express = require('express')
, routes = require('./routes')
, http = require('http')
, path = require('path')
, googleapis = require('googleapis')
, OAuth2Client = googleapis.OAuth2Client
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

db.run("CREATE TABLE IF NOT EXISTS tokens (token TEXT, ripple_address TEXT)");

var notifier = new Notifier();

db.each("SELECT token, ripple_address AS address FROM tokens", function(err, row) {
  if (err) {
    failure(err);
    return;
  }

  if (row.address) {
    console.log("Resubscribing "+row.address+" => "+row.token);
    notifier.subscribe(row.address, row.token);
  }
});

// development only
if ('development' == app.get('env')) {
    app.use(express.errorHandler());
}

var success = function(data) { console.log('success',data); };
var failure = function(data) { console.log('failure',data); };

app.get('/', function(req,res){
    db.get('SELECT token, ripple_address AS address FROM tokens WHERE token = ?',
           req.cookies.token,
           function (err, row) {
             if (err) console.error(err);

             var address = row ? row.address : '';
             res.render('index', {
               title: 'Ripple Notifier for Google Glass',
               token: row ? req.cookies.token : false,
               address: address
             });
             res.end();
           });
});

app.get('/signup', function(req, res) {
    var oauth2Client = new OAuth2Client(config.CLIENT_ID, config.CLIENT_SECRET, config.REDIRECT_URL);
    // generates a url that allows offline access and asks permissions
    // for Mirror API scope.
    var url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: 'https://www.googleapis.com/auth/glass.timeline'
    });
    res.redirect(url);
});

app.post('/settings/address', function(req, res) {
    var address = ripple.UInt160.from_json(req.body.address);
    if (!address.is_valid()) {
      throw new Error("Invalid address!");
    }
    address = address.to_json();
    var token = req.cookies.token;

    db.get('SELECT token, ripple_address AS address FROM tokens WHERE token = ?',
           token,
           function (err, row) {
             if (!row) {
               res.send(500, {error: "Unknown token"});
             } else {
               notifier.unsubscribe(row.address, token);
               notifier.subscribe(address, token);
               db.run("UPDATE tokens SET ripple_address = ? WHERE token = ?",
                      address, token);
               res.json({success: true});
             }
           });
});

app.get('/oauth2callback', function(req, res){
    var oauth2Client = new OAuth2Client(config.CLIENT_ID, config.CLIENT_SECRET, config.REDIRECT_URL);
    oauth2Client.getToken(req.query.code, function(err, tokens){
        if (!!err){
            failure(err);
        } else {
            console.log('tokens', tokens);
            var stmt = db.prepare("INSERT INTO tokens (token, ripple_address) VALUES (?, ?)");
            stmt.run(tokens.access_token, '');
            stmt.finalize();
            res.cookie('token', tokens.access_token);
            res.redirect("/");
        }
    });
});


http.createServer(app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
});
