/*
  Quick and dirty methods for some S3 action
*/

var Belt = require('jsbelt')
  , Async = require('async')
  , Path = require('path')
  , AWS = require('aws-sdk')
  , _ = require('underscore')
  , Zlib = require('zlib');

(function(){

  var S3 = function(O){
    var S = {};

    S.settings = Belt.extend({}, O);
    S._API = new AWS.S3(S.settings);

    S['fileExists'] = function(bucket, path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {

      });

      return Async.waterfall([
        function(cb){
          var req = {
            'Bucket': bucket
          , 'Key': path
          };

          return S._API.headObject(req, Belt.callset(cb, globals, 'response', 1));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback((err || !Belt._get(globals, 'response.LastModified')) ? false : true);
      });
    };

    S['getFile'] = function(bucket, path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {
        'encoding': 'utf8'
      });

      return Async.waterfall([
        function(cb){
          var req = {
            'Bucket': bucket
          , 'Key': path
          };

          return S._API.getObject(req, Belt.callset(cb, globals, 'response', 1, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err, a.options.return_buffer ? Belt._get(globals, 'response.Body')
                                                       : Belt._call(globals, 'response.Body.toString', a.options.encoding));
      });
    };

    S['writeFile'] = function(bucket, path, body_str, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {
        'encoding': 'utf8'
      , 'acl': 'private'
      });

      return Async.waterfall([
        function(cb){
          var req = {
            'Bucket': bucket
          , 'Key': path
          , 'ACL': a.options.acl
          , 'Body': body_str
          , 'ContentEncoding': a.options.encoding
          };

          return S._API.putObject(req, Belt.callwrap(cb, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err);
      });
    };

    S['copyFile'] = function(bucket, path, dest_bucket, dest_path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {
        'encoding': 'utf8'
      , 'acl': 'private'
      });

      return Async.waterfall([
        function(cb){
          var req = {
            'CopySource': bucket + '/' + path
          , 'Bucket': dest_bucket
          , 'Key': dest_path
          , 'ACL': a.options.acl
          , 'ContentEncoding': a.options.encoding
          };

          return S._API.copyObject(req, Belt.callwrap(cb, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err);
      });
    };

    S['deleteFiles'] = function(bucket, paths, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {

      });

      var objs = Belt.toArray(paths);
      if (!_.any(objs)) return a.callback();

      return Async.waterfall([
        function(cb){
          var req = {
            'Bucket': bucket
          , 'Delete': {'Objects': _.map(objs, function(o){ return {'Key': o}; })}
          };

          return S._API.deleteObjects(req, Belt.callwrap(cb, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err);
      });
    };

    S['deleteFile'] = S['deleteFiles']; //alias

    S['moveFile'] = function(bucket, path, dest_bucket, dest_path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {

      });

      return Async.waterfall([
        function(cb){
          return S.copyFile(bucket, path, dest_bucket, dest_path, a.options, Belt.callwrap(cb, 0));
        }
      , function(cb){
          return S.deleteFiles(bucket, path, a.options, Belt.callwrap(cb, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err);
      });
    };

    S['readdir'] = function(bucket, path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {

      });

      var req = {
        'Bucket': bucket
      , 'Prefix': Belt._call(path, 'match',/\/$/) ? path : path + '/'
      };

      return Async.waterfall([
        function(cb){
          return S._API.listObjects(req, Belt.callset(cb, globals, 'response', 1, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err, _.chain(Belt._get(globals, 'response.Contents') || [])
                                .pluck('Key')
                                .map(function(d){ return Belt._call(d, 'replace', new RegExp('^' + req.Prefix), ''); })
                                .value()
                         );
      });
    };

    S['dirExists'] = function(bucket, path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {

      });

      return Async.waterfall([
        function(cb){
          return S.readdir(bucket, path, a.options, Belt.callset(cb, globals, 'files', 1, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err || !_.any(globals.files) ? false: true);
      });
    };

    S['rmdir'] = function(bucket, path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {

      });

      return Async.waterfall([
        function(cb){
          return S.readdir(bucket, path, Belt.callset(cb, globals, 'keys', 1, 0));
        }
      , function(cb){
          return S.deleteFiles(bucket, _.map(globals.keys, function(k){ return path +'/' + k; }), Belt.callwrap(cb, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err);
      });
    };

    S['getGzipFile'] = function(bucket, path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {
        'encoding': 'utf8'
      , 'acl': 'private'
      });

      return Async.waterfall([
        function(cb){
          return S.getFile(bucket, path, _.extend({}, a.options, {'return_buffer': true})
                          , Belt.callset(cb, globals, 'gzip', 1, 0));
        }
      , function(cb){
          return Zlib.gunzip(globals.gzip, Belt.callset(cb, globals, 'body', 1, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err, Belt._call(globals, 'body.toString', a.options.encoding));
      });
    };

    S['writeGzipFile'] = function(bucket, path, body_str, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {
        'encoding': 'utf8'
      , 'acl': 'private'
      });

      return Async.waterfall([
        function(cb){
          var buf = new Buffer(body_str, a.options.encoding);
          return Zlib.gzip(buf, Belt.callset(cb, globals, 'gzip', 1, 0));
        }
      , function(cb){
          return S.writeFile(bucket, path, globals.gzip, a.options, Belt.callwrap(cb, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err);
      });
    };

    S['getJSON'] = function(bucket, path, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {
        'encoding': 'utf8'
      , 'acl': 'private'
      });

      return Async.waterfall([
        function(cb){
          return S.getFile(bucket, path, a.options, Belt.callset(cb, globals, 'body', 1, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err, JSON.parse(Belt._call(globals, 'body.toString', a.options.encoding)));
      });
    };

    S['writeJSON'] = function(bucket, path, json, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {
        'encoding': 'utf8'
      , 'acl': 'private'
      });

      return Async.waterfall([
        function(cb){
          return S.writeFile(bucket, path, JSON.stringify(json, null, 2), a.options, Belt.callwrap(cb, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err);
      });
    };

    return S;
  };

  return module.exports = S3; 

}).call(this);
