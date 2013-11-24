var googleapis = require('googleapis'),
    OAuth2Client = googleapis.OAuth2Client,
    ripple = require('ripple-lib'),
    config = require('./config.json');

var Notifier = function () {
  this.remote = new ripple.Remote({
    servers: config.RIPPLE_REMOTES
  });

  this.subscriptions = {};

  this.remote.connect();

  this.remote.on('connect', this.handleConnect.bind(this));
  this.remote.on('disconnect', this.handleDisconnect.bind(this));
  this.remote.on('transaction_all', this.handleTransaction.bind(this));
};

Notifier.prototype.handleConnect = function () {
  console.log("Connected to Ripple");
};

Notifier.prototype.handleDisconnect = function () {
  console.log("Lost connection to Ripple");
};

Notifier.prototype.handleTransaction = function (msg) {
  var _this = this;
  msg.mmeta.getAffectedAccounts().forEach(function(account) {
    if (_this.subscriptions[account]) {
      Object.keys(_this.subscriptions[account]).forEach(function (token) {
        _this.notifyTransaction(token, account, msg);
      });
    }
  });
};

Notifier.prototype.subscribe = function (address, token) {
  if (!this.subscriptions[address]) {
    this.subscriptions[address] = {};
  }

  this.subscriptions[address][token] = true;
};

Notifier.prototype.unsubscribe = function (address, token) {
  if (!this.subscriptions[address]) return;

  delete this.subscriptions[address][token];
};

Notifier.prototype.notifyTransaction = function (token, address, msg) {
  console.log(msg);
  // Ignore unsuccessful transactions
  if (msg.engine_result !== 'tesSUCCESS') {
    return;
  }

  var item;
  // Received payment
  if (msg.transaction.TransactionType === 'Payment' &&
      msg.transaction.Destination === address) {
    var amount = ripple.Amount.from_json(msg.transaction.Amount);
    item = {
      "text": "You received "+amount.to_human()+" "+amount.currency().to_json()
    };
  }

  if (item) {
    item.menuItems =  [{"action": "DELETE"}];
    this.notifyTimelineItem(token, item);
  }
};

Notifier.prototype.notifyTimelineItem = function (token, item) {
  var oauth2Client = new OAuth2Client(config.CLIENT_ID, config.CLIENT_SECRET, config.REDIRECT_URL);
  oauth2Client.credentials = {
    token_type: "Bearer",
    access_token: token
  };

  googleapis
    .discover('mirror', 'v1')
    .execute(function(err, client) {
      if (!!err){
        console.error(err);
        return;
      }

      client
        .mirror.timeline.insert(item)
        .withAuthClient(oauth2Client)
        .execute(function(err, data) {
          if (!!err){
            console.error(err);
            return;
          }
          console.log("Deployed notification: "+item.text);
        });
    });
};

exports.Notifier = Notifier;
