/**
 * keythereum unit tests
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var fs = require("fs");
var join = require("path").join;
var crypto = require("crypto");
var assert = require("chai").assert;
var geth = require("geth");
var keythereum = require("../");
var checkKeyObj = require("./checkKeyObj");

// geth.debug = true;

var NUM_TESTS = 1000;
var TIMEOUT = 5000;
var DATADIR = join(__dirname, "fixtures");

var options = {
    persist: false,
    flags: {
        networkid: "10101",
        port: 30304,
        rpcport: 8547,
        nodiscover: null,
        datadir: DATADIR,
        ipcpath: join(DATADIR, "geth.ipc"),
        password: join(DATADIR, ".password")
    }
};

function createEthereumKey(passphrase) {
    var dk = keythereum.create();
    var key = keythereum.dump(passphrase, dk.privateKey, dk.salt, dk.iv);
    return JSON.stringify(key);
}

keythereum.constants.quiet = true;

describe("Unlock randomly-generated accounts in geth", function () {

    var test = function (t) {

        var label = "[" + t.kdf + " | " + t.hashRounds + " rounds] "+
            "generate key file using password '" + t.password +"'";

        it(label, function (done) {
            this.timeout(TIMEOUT*2);

            var json = createEthereumKey(t.password);
            assert.isNotNull(json);

            var keyObject = JSON.parse(json);
            assert.isObject(keyObject);
            checkKeyObj.structure(keythereum, keyObject);

            keythereum.exportToFile(keyObject, join(DATADIR, "keystore"), function (keypath) {
                fs.writeFile(options.flags.password, t.password, function (ex) {
                    var fail;
                    if (ex) return done(ex);
                    options.flags.unlock = keyObject.address;
                    options.flags.etherbase = keyObject.address;
                    geth.start(options, {
                        stderr: function (data) {
                            if (geth.debug) process.stdout.write(data);
                            if (data.toString().indexOf("16MB") > -1) {
                                geth.trigger(null, geth.proc);
                            }
                        },
                        close: function () {
                            fs.unlink(options.flags.password, function (exc) {
                                if (exc) return done(exc);
                                fs.unlink(keypath, function (exc) {
                                    if (exc) return done(exc);
                                    done(fail);
                                });
                            });
                        }
                    }, function (err, spawned) {
                        if (err) return done(err);
                        if (!spawned) return done(new Error("where's the geth?"));
                        geth.stdout("data", function (data) {
                            var unlocked = "Account '" + keyObject.address+
                                "' (" + keyObject.address + ") unlocked.";
                            if (data.toString().indexOf(unlocked) > -1) {
                                geth.stop();
                            }
                        });
                        geth.stderr("data", function (data) {
                            if (data.toString().indexOf("Fatal") > -1) {
                                fail = new Error(data);
                                geth.stop();
                            }
                        });
                    });
                });
            });
        });
    };

    var password, hashRounds;

    for (var i = 0; i < NUM_TESTS; ++i) {
        
        password = crypto.randomBytes(Math.ceil(Math.random()*100));
        hashRounds = Math.ceil(Math.random() * 300000);

        keythereum.constants.pbkdf2.c = hashRounds;
        keythereum.constants.scrypt.n = hashRounds;

        test({
            password: password.toString("hex"),
            hashRounds: hashRounds,
            kdf: "pbkdf2"
        });
        test({
            password: password.toString("base64"),
            hashRounds: hashRounds,
            kdf: "scrypt"
        });

        test({
            password: password.toString("hex"),
            hashRounds: hashRounds,
            kdf: "pbkdf2"
        });
        test({
            password: password.toString("base64"),
            hashRounds: hashRounds,
            kdf: "scrypt"
        });
    }

});
