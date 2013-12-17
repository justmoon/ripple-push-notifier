var ripple = require('ripple-lib'),
    config = require('./config.json'),
    pushover = require('pushover.net');

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

Notifier.prototype.subscribe = function (address, key) {
  if (!this.subscriptions[address]) {
    this.subscriptions[address] = {};
  }

  this.subscriptions[address][key] = true;
};

Notifier.prototype.unsubscribe = function (address, key) {
  if (!this.subscriptions[address]) return;

  delete this.subscriptions[address][key];
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
      "message": "You received "+amount.to_human()+" "+amount.currency().to_json(),
      "sound": "cashregister"
    };
  } else if (msg.transaction.TransactionType === 'Payment' &&
             msg.transaction.Account === address) {
    amount = ripple.Amount.from_json(msg.transaction.Amount);
    item = {
      "title": "Outgoing payment",
      "message": "You sent "+amount.to_human()+" "+amount.currency().to_json(),
      "sound": "cashregister"
    };
  }

  if (item) {
    item.url = "https://ripple.com/graph/#"+msg.transaction.hash;
    this.notifyTimelineItem(key, item);
  }
};

Notifier.prototype.notifyTimelineItem = function (key, item) {
  item.token = config.PUSHOVER_TOKEN;
  item.user = key;

  console.log(item);
  pushover(item, function(err, ok) {
    if (err) {
      console.error(err);
    } else {
      console.log("Pushed message to "+key);
    }
  });
};

exports.Notifier = Notifier;
