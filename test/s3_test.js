'use strict';

var Awstk = require('../lib/awstk.js')
  , Optionall = require('optionall')
  , Async = require('async')
  , Path = require('path')
  , Moment = require('moment')
  , Belt = require('jsbelt')
  , _ = require('underscore')
  , O = new Optionall(Path.resolve('./'))
  , S3 = new Awstk.s3(O.aws)
;

exports['aws'] = {
  setUp: function(done) {
    // setup here
    done();
  },
  's3': function(test) {
    var globals = {
      'body': 'this is the test document for awstk'
    , 'bucket': O.s3_bucket
    , 'dir': O.s3_dir
    , 'doc': O.s3_doc
    };

    return Async.waterfall([
      //writing and reading files
      function(cb){
        return S3.writeFile(globals.bucket, globals.dir + '/' +globals.doc, globals.body, cb);
      }
    , function(cb){
        return S3.getFile(globals.bucket, globals.dir + '/' +globals.doc, Belt.callset(cb, globals, 'get_body', 1, 0));
      }
    , function(cb){
        test.ok(globals.get_body === globals.body);
        return cb();
      }
    , function(cb){
        globals.body = 'overwritten file';

        return S3.writeFile(globals.bucket, globals.dir + '/' +globals.doc, globals.body, cb);
      }
    , function(cb){
        return S3.getFile(globals.bucket, globals.dir + '/' +globals.doc, Belt.callset(cb, globals, 'get_body', 1, 0));
      }
    , function(cb){
        test.ok(globals.get_body === globals.body);
        return cb();
      }

      //file existence
    , function(cb){
        return S3.fileExists(globals.bucket, globals.dir + '/' +globals.doc, function(exists){
          test.ok(exists);
          return cb();
        });
      }
    , function(cb){
        return S3.fileExists(globals.bucket, globals.dir, function(exists){
          test.ok(!exists);
          return cb();
        });
      }
    , function(cb){
        return S3.fileExists(globals.bucket, globals.dir + '/randomnonexistent.file', function(exists){
          test.ok(!exists);
          return cb();
        });
      }
    , function(cb){
        return S3.fileExists(globals.bucket, 'crazyrandomkey/randomnonexistent.file', function(exists){
          test.ok(!exists);
          return cb();
        });
      }

      //deleting files
    , function(cb){
        return S3.deleteFile(globals.bucket, globals.dir + '/' +globals.doc, cb);
      }
    , function(cb){
        return S3.fileExists(globals.bucket, globals.dir + '/' +globals.doc, function(exists){
          test.ok(!exists);
          return cb();
        });
      }
    , function(cb){
        return S3.deleteFile(globals.bucket, 'crazyrandomkey/randomnonexistent.file', cb);
      }
    , function(cb){
        globals.counters = [1, 2, 3, 4, 5];
        return Async.eachSeries(globals.counters, function(f, _cb){
          return S3.writeFile(globals.bucket, globals.dir + '/' +globals.doc + '.' + f, globals.body, _cb);
        }, cb);
      }
    , function(cb){
        return S3.deleteFile(globals.bucket
                            , _.map(globals.counters, function(c){ return globals.dir + '/' +globals.doc + '.' + c; })
                            , cb);
      }
    , function(cb){
        return Async.eachSeries(globals.counters, function(f, _cb){
          return S3.fileExists(globals.bucket, globals.dir + '/' +globals.doc + '.' + f, function(exists){
            test.ok(!exists);
            return _cb();
          });
        }, cb);
      }

      //copying files
    , function(cb){
        globals.counters = [1, 2, 3, 4, 5];
        return Async.eachSeries(globals.counters, function(f, _cb){
          return S3.writeFile(globals.bucket, globals.dir + '/' +globals.doc + '.' + f, globals.body, _cb);
        }, cb);
      }
    , function(cb){
        return S3.copyFile(globals.bucket, globals.dir + '/' +globals.doc + '.1'
                          , globals.bucket, globals.dir + '/' +globals.doc + '.6', cb);
      }
    , function(cb){
        return Async.eachSeries([1, 6], function(f, _cb){
          return S3.fileExists(globals.bucket, globals.dir + '/' +globals.doc + '.' + f, function(exists){
            test.ok(exists);
            return _cb();
          });
        }, cb);
      }
    , function(cb){
        return S3.deleteFile(globals.bucket
                            , _.map(globals.counters.concat([6]), function(c){ return globals.dir + '/' +globals.doc + '.' + c; })
                            , cb);
      }

      //moving files
    , function(cb){
        globals.counters = [1, 2, 3, 4, 5];
        return Async.eachSeries(globals.counters, function(f, _cb){
          return S3.writeFile(globals.bucket, globals.dir + '/' +globals.doc + '.' + f, globals.body, _cb);
        }, cb);
      }
    , function(cb){
        return S3.moveFile(globals.bucket, globals.dir + '/' +globals.doc + '.1'
                          , globals.bucket, globals.dir + '/' +globals.doc + '.6', cb);
      }
    , function(cb){
        return S3.fileExists(globals.bucket, globals.dir + '/' +globals.doc + '.1', function(exists){
          test.ok(!exists);
          return cb();
        });
      }
    , function(cb){
        return S3.fileExists(globals.bucket, globals.dir + '/' +globals.doc + '.6', function(exists){
          test.ok(exists);
          return cb();
        });
      }
    , function(cb){
        return S3.deleteFile(globals.bucket
                            , _.map(globals.counters.concat([6]), function(c){ return globals.dir + '/' + globals.doc + '.' + c; })
                            , cb);
      }

      //reading directories
    , function(cb){
        globals.counters = [1, 2, 3, 4, 5];
        return Async.eachSeries(globals.counters, function(f, _cb){
          return S3.writeFile(globals.bucket, globals.dir + '/' +globals.doc + '.' + f, globals.body, _cb);
        }, cb);
      }
    , function(cb){
        return S3.readdir(globals.bucket, globals.dir, Belt.callset(cb, globals, 'get_dir', 1, 0));
      }
    , function(cb){
        test.ok(Belt.deepEqual(_.map(globals.counters, function(c){ return globals.doc + '.' + c; }), globals.get_dir));
        return cb();
      }
    , function(cb){
        return S3.deleteFile(globals.bucket
                            , _.map(globals.counters, function(c){ return globals.dir + '/' + globals.doc + '.' + c; })
                            , cb);
      }

      //deep directory creation
    , function(cb){
        globals.counters = [1, 2, 3, 4, 5];
        return Async.eachSeries(globals.counters, function(f, _cb){
          return S3.writeFile(globals.bucket, globals.dir + '/deep/directory/testing/' +globals.doc + '.' + f, globals.body, _cb);
        }, cb);
      }
    , function(cb){
        return S3.readdir(globals.bucket, globals.dir + '/deep/directory/testing/', Belt.callset(cb, globals, 'get_dir', 1, 0));
      }
    , function(cb){
        test.ok(Belt.deepEqual(_.map(globals.counters, function(c){ return globals.doc + '.' + c; }), globals.get_dir));
        return cb();
      }
    , function(cb){
        return S3.deleteFile(globals.bucket
                            , _.map(globals.counters, function(c){ return globals.dir + '/deep/directory/testing/' + globals.doc + '.' + c; })
                            , cb);
      }
    , function(cb){
        return S3.readdir(globals.bucket, 'this directory does not exist/at all', Belt.callset(cb, globals, 'get_dir'));
      }
    , function(cb){
        test.ok(!_.any(globals.get_dir));
        return cb();
      }

      //directory existence
    , function(cb){
        globals.counters = [1, 2, 3, 4, 5];
        return Async.eachSeries(globals.counters, function(f, _cb){
          return S3.writeFile(globals.bucket, globals.dir + '/' +globals.doc + '.' + f, globals.body, _cb);
        }, cb);
      }
    , function(cb){
        return S3.dirExists(globals.bucket, globals.dir, function(exists){
          test.ok(exists);
          return cb();
        });
      }
    , function(cb){
        return S3.dirExists(globals.bucket, 'this directory does not exist', function(exists){
          test.ok(!exists);
          return cb();
        });
      }
    , function(cb){
        return S3.deleteFile(globals.bucket
                            , _.map(globals.counters, function(c){ return globals.dir + '/' + globals.doc + '.' + c; })
                            , cb);
      }

      //removing directories
    , function(cb){
        globals.counters = [1, 2, 3, 4, 5];
        return Async.eachSeries(globals.counters, function(f, _cb){
          return S3.writeFile(globals.bucket, globals.dir + '/' +globals.doc + '.' + f, globals.body, _cb);
        }, cb);
      }
    , function(cb){
        return S3.rmdir(globals.bucket, globals.dir, Belt.callwrap(cb, 0));
      }
    , function(cb){
        return S3.dirExists(globals.bucket, globals.dir, function(exists){
          test.ok(!exists);
          return cb();
        });
      }
    , function(cb){
        return S3.rmdir(globals.bucket, 'this directory/doesnot/exist', Belt.callwrap(cb, 0));
      }

      //writing and reading gzip files
    , function(cb){
        globals.body = 'This is not gzipped.';

        return S3.writeGzipFile(globals.bucket, globals.dir + '/' +globals.doc, globals.body, cb);
      }
    , function(cb){
        return S3.getFile(globals.bucket, globals.dir + '/' +globals.doc, Belt.callset(cb, globals, 'get_body', 1, 0));
      }
    , function(cb){
        test.ok(globals.get_body !== globals.body);
        return cb();
      }
    , function(cb){
        return S3.getGzipFile(globals.bucket, globals.dir + '/' +globals.doc, Belt.callset(cb, globals, 'get_body', 1, 0));
      }
    , function(cb){
        test.ok(globals.get_body === globals.body);
        return cb();
      }
    , function(cb){
        return S3.rmdir(globals.bucket, globals.dir, Belt.callwrap(cb, 0));
      }

    , function(cb){
        globals.body = {'json': {'here': [1, 2, 3, 4, 5, {}]}};

        return S3.writeJSON(globals.bucket, globals.dir + '/' +globals.doc, globals.body, cb);
      }
    , function(cb){
        return S3.getFile(globals.bucket, globals.dir + '/' +globals.doc, Belt.callset(cb, globals, 'get_body', 1, 0));
      }
    , function(cb){
        test.ok(!Belt.deepEqual(globals.get_body, globals.body));
        return cb();
      }
    , function(cb){
        return S3.getJSON(globals.bucket, globals.dir + '/' +globals.doc, Belt.callset(cb, globals, 'get_body', 1, 0));
      }
    , function(cb){
        test.ok(Belt.deepEqual(globals.get_body, globals.body));
        return cb();
      }
    , function(cb){
        return S3.rmdir(globals.bucket, globals.dir, Belt.callwrap(cb, 0));
      }

      //clean up
    , function(cb){
        return S3.rmdir(globals.bucket, globals.dir, Belt.callwrap(cb, 0));
      }
    ], function(err){
      test.ok(!err);
      return test.done();
    });
  }
};
