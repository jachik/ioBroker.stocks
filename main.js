/**
 *
 * stocks adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "stocks",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.1",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js stocks Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "jachik <jacek@uni-koblenz.de>"
 *          ]
 *          "desc":         "stocks adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "schedule",                   // possible values "daemon", "schedule", "subscribe"
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "symbols": "",                              // the symbols configured
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter = utils.adapter('stocks');

// request module
var request = require("request");

// defined properties in JSON
var objectList = require(__dirname+'/objectlist.json');
var objectCount =0;

// symbol-configuration string
var symbolstring = "";

// symbol array
var symbols;
var symbolCount;

// the request URL with symbols
var requestURL = "";

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function init() {
    // prepare symbols
    symbolstring = adapter.config.symbols;
    symbols = symbolstring.split(",");
    symbolCount = symbols.length;

    if (symbolCount < 1) {
        // no symbols defined
        adapter.log.error('no symbols defined');
    }

    // define Request-URL
    var params = "(";
    for (var i = 0; i < symbols.length; i++) {
        params = params + "\"" + symbols[i] + "\"";
        if (i == symbols.length - 1) {
            // last object
            params = params + ")";
        } else {
            params = params + ",";
        }
    }
    requestURL = "https://query.yahooapis.com/v1/public/yql?q=" + encodeURI("select * from yahoo.finance.quotes where symbol in " + params) + "%0A%09%09&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys";
}

function createObjects(symbol) {
    adapter.setObjectNotExists('quotes.'+symbol, {
        type: 'channel',
        common: {
            name: symbol
        },
        native: {}
    });

    // create objects for every property if not exists
    objectCount = Object.keys(objectList).length;
    for (var key in objectList) {
        var name = key;
        var unit = '';
        var role = '';
        var type = '';
        switch (objectList[key].type) {
            case "STRING":
                type = "string";
                role = "value";
                break;
            case "CURRENCY":
                type = "number";
                role = "info";
                break;
            case "DATE":
                type = "string";
                role = "value.date";
                break;
            default:
                adapter.log.debug('Type undefined '+objectList[key].type);
                break;
        }
        var obj = {
            type: 'state',
            common: {
                name: name,
                type: type,
                role: role,
                unit: unit
            },
            native: {}
        }
        adapter.setObjectNotExists('quotes.' + symbol+'.'+ key, obj);
    }
}

function saveValues(obj) {
    if (obj["symbol"]=="undefined") {
        adapter.log.error('property symbol not defined');
        return;
    }

    // first check if all objects for the symbol exists or create them if they are missing
    createObjects(obj["symbol"]);

    var state;
    var value;
    for (var key in objectList) {
        value = obj[key];
        if (isset(value) && value!=null) {
            switch (objectList[key].type) {
                case "STRING":
                case "CURRENCY":
                    state = value;
                    break;
                case "DATE":
                    var date = new Date(value * 1000);
                    state = date.toLocaleDateString();
                    break;
                default:
                    adapter.log.error('setValues: Type not defined: '+objectList[key].type);
                    break;
            }
            adapter.log.debug('Property: '+key+ ' State: '+state + ' Symbol: '+obj["symbol"]+' Value: '+value);
            adapter.setState('quotes.' + obj["symbol"] + '.' + key, {val: state, ack: true});
        }
        else {
            adapter.log.debug('Value not exists: '+key);
        }
    }
}

function isset(o) {
    return (typeof o) != 'undefined';
}

function makeRequest() {
    // define quotes channel if not exists
    adapter.setObjectNotExists('quotes', {
        type: 'channel',
        common: {
            name: 'quotes'
        },
        native: {}
    });

    adapter.log.debug('Making request with'+requestURL);
    request({
        url: requestURL
    }, function (error, response, body) {
        var obj = JSON.parse(body)

        var count = obj["query"]["count"];
        adapter.log.debug('Getting response with ' + count + 'qoutes');
        if (count != "undefined") {
            var quotes = obj["query"]["results"]["quote"];
            if (quotes != "undefined") {
                for (var i = 0; i < count; i++) {
                    var data = quotes[i];
                    saveValues(data);
                }
            }
            else {
                adapter.log.error('quote not defined in json');
            }
        }
    });
}

function main() {
    adapter.log.debug('schedule started');
    // init adapter
    init();

    // make the request for all defined symbols
    makeRequest();

    // stop the adapter after 15 seconds
    setTimeout(adapter.stop, 15000);
}
