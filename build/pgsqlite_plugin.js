(function() {
  var callbacks, cbref, counter, getOptions, root;

  root = this;

  callbacks = {};

  counter = 0;

  cbref = function(hash) {
    var f;
    f = "cb" + (counter += 1);
    callbacks[f] = hash;
    return f;
  };

  getOptions = function(opts, success, error) {
    var cb, has_cbs;
    cb = {};
    has_cbs = false;
    if (typeof success === "function") {
      has_cbs = true;
      cb.success = success;
    }
    if (typeof error === "function") {
      has_cbs = true;
      cb.error = error;
    }
    if (has_cbs) opts.callback = cbref(cb);
    return opts;
  };

  root.PGSQLitePlugin = (function() {

    PGSQLitePlugin.prototype.openDBs = {};

    function PGSQLitePlugin(dbPath, openSuccess, openError) {
      this.dbPath = dbPath;
      this.openSuccess = openSuccess;
      this.openError = openError;
      if (!dbPath) {
        throw new Error("Cannot create a PGSQLitePlugin instance without a dbPath");
      }
      this.openSuccess || (this.openSuccess = function() {
        console.log("DB opened: " + dbPath);
      });
      this.openError || (this.openError = function(e) {
        console.log(e.message);
      });
      this.open(this.openSuccess, this.openError);
    }

    PGSQLitePlugin.handleCallback = function(ref, type, obj) {
      var _ref;
      if ((_ref = callbacks[ref]) != null) {
        if (typeof _ref[type] === "function") _ref[type](obj);
      }
      callbacks[ref] = null;
      delete callbacks[ref];
    };

    PGSQLitePlugin.prototype.executeSql = function(sql, params, success, error) {
      var opts, successcb;
      if (!sql) throw new Error("Cannot executeSql without a query");
      successcb = null;
      if (success) {
        successcb = function(execres) {
          var res, saveres;
          saveres = execres;
          res = {
            item: function(i) {
              return saveres[i];
            },
            length: saveres.length
          };
          return success(res);
        };
      }
      opts = getOptions({
        query: [sql].concat(params || []),
        path: this.dbPath
      }, successcb, error);
      PhoneGap.exec("PGSQLitePlugin.backgroundExecuteSql", opts);
    };

    PGSQLitePlugin.prototype.transaction = function(fn, error, success) {
      var t;
      t = new root.PGSQLitePluginTransaction(this.dbPath);
      fn(t);
      return t.complete(success, error);
    };

    PGSQLitePlugin.prototype.open = function(success, error) {
      var opts;
      if (!(this.dbPath in this.openDBs)) {
        this.openDBs[this.dbPath] = true;
        opts = getOptions({
          path: this.dbPath
        }, success, error);
        PhoneGap.exec("PGSQLitePlugin.open", opts);
      }
    };

    PGSQLitePlugin.prototype.close = function(success, error) {
      var opts;
      if (this.dbPath in this.openDBs) {
        delete this.openDBs[this.dbPath];
        opts = getOptions({
          path: this.dbPath
        }, success, error);
        PhoneGap.exec("PGSQLitePlugin.close", opts);
      }
    };

    return PGSQLitePlugin;

  })();

  root.PGSQLitePluginTransaction = (function() {

    function PGSQLitePluginTransaction(dbPath) {
      this.dbPath = dbPath;
      this.executes = [];
    }

    PGSQLitePluginTransaction.prototype.executeSql = function(sql, params, success, error) {
      var errorcb, successcb, txself;
      txself = this;
      successcb = null;
      if (success) {
        successcb = function(execres) {
          var res, saveres;
          saveres = execres;
          res = {
            item: function(i) {
              return saveres[i];
            },
            length: saveres.length
          };
          return success(txself, res);
        };
      }
      errorcb = null;
      if (error) {
        errorcb = function(res) {
          return error(txself, res);
        };
      }
      this.executes.push(getOptions({
        query: [sql].concat(params || []),
        path: this.dbPath
      }, successcb, errorcb));
    };

    PGSQLitePluginTransaction.prototype.complete = function(success, error) {
      var begin_opts, commit_opts, errorcb, executes, opts, successcb, txself;
      if (this.__completed) throw new Error("Transaction already run");
      this.__completed = true;
      txself = this;
      successcb = function(res) {
        return success(txself, res);
      };
      errorcb = function(res) {
        return error(txself, res);
      };
      begin_opts = getOptions({
        query: ["BEGIN;"],
        path: this.dbPath
      });
      commit_opts = getOptions({
        query: ["COMMIT;"],
        path: this.dbPath
      }, successcb, errorcb);
      executes = [begin_opts].concat(this.executes).concat([commit_opts]);
      opts = {
        executes: executes
      };
      PhoneGap.exec("PGSQLitePlugin.backgroundExecuteSqlBatch", opts);
      this.executes = [];
    };

    return PGSQLitePluginTransaction;

  })();

}).call(this);
