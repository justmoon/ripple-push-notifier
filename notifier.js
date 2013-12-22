var ripple = require('ripple-lib'),
    config = require('./config.json'),
    pushover = require('pushover.net'),
    apn = require('apn');

// Set up connection to Apple APNS
var apnOptions = { "gateway": "gateway.sandbox.push.apple.com" };
var apnConnection = new apn.Connection(apnOptions);

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
      Object.keys(_this.subscriptions[account]).forEach(function (key) {
        _this.notifyTransaction(key, account, msg);
      });
    }
  });
};

Notifier.prototype.subscribe = function (address, key, type) {
  if (!this.subscriptions[address]) {
    this.subscriptions[address] = {};
  }

  this.subscriptions[address][type+":"+key] = true;
};

Notifier.prototype.unsubscribe = function (address, key, type) {
  if (!this.subscriptions[address]) return;

  delete this.subscriptions[address][type+":"+key];
};

Notifier.prototype.notifyTransaction = function (key, address, msg) {
  console.log(msg);
  // Ignore unsuccessful transactions
  if (msg.engine_result !== 'tesSUCCESS') {
    return;
  }

  var item, amount;
  // Received payment
  if (msg.transaction.TransactionType === 'Payment' &&
      msg.transaction.Destination === address) {
    amount = ripple.Amount.from_json(msg.transaction.Amount);
    item = {
      "title": "Incoming payment",
      "message": "You received "+amount.to_human()+" "+amount.currency().to_json()
    };
  } else if (msg.transaction.TransactionType === 'Payment' &&
             msg.transaction.Account === address) {
    amount = ripple.Amount.from_json(msg.transaction.Amount);
    item = {
      "title": "Outgoing payment",
      "message": "You sent "+amount.to_human()+" "+amount.currency().to_json()
    };
  }

  if (item) {
    item.url = "https://ripple.com/graph/#"+msg.transaction.hash;
    this.notifyTimelineItem(key, item);
  }
};

Notifier.prototype.notifyTimelineItem = function (key, item) {
  var temp = key.split(":");
  var type = temp[0];
  key = temp.slice(1).join(":");

  switch (type) {
  case 'pushover':
    item.token = config.PUSHOVER_TOKEN;
    item.user = key;
    item.sound = "cashregister";

    console.log(item);
    pushover(item, function(err, ok) {
      if (err) {
        console.error(err);
      } else {
        console.log("Pushed message to "+key);
      }
    });
    break;
  case 'apn':
    var apnDevice = new apn.Device(key);
    var apnNote = new apn.Notification();
    apnNote.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
    apnNote.badge = 3;
    apnNote.sound = "ping.aiff";
    apnNote.alert = "\uD83D\uDCE7 \u2709 "+item.message;
    apnNote.payload = {'messageFrom': 'Caroline'};

    apnConnection.pushNotification(apnNote, apnDevice);
    break;
  default:
    console.error('Unknown subscription type "'+type+'"');
  }
};

exports.Notifier = Notifier;
