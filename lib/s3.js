/*
  Quick and dirty methods for some S3 action
*/

var Belt = require('jsbelt')
  , Async = require('async')
  , Path = require('path')
  , AWS = require('aws-sdk')
  , _ = require('underscore')
  , FS = require('fs')
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

    S['getFile'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};

      a.options = _.defaults(a.options, {
        'encoding': 'utf8'
      });

      return Async.waterfall([
        function(cb){
          var req = {
            'Bucket': options.Bucket
          , 'Key': options.Key
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
          var req = Belt.extend({
            'Bucket': bucket
          , 'Key': path
          , 'ACL': a.options.acl
          , 'Body': body_str
          , 'ContentEncoding': a.options.encoding
          }, _.pick(a.options, ['Metadata']));

          return S._API.putObject(req, Belt.callwrap(cb, 0));
        }
      ], function(err){
        if (err) console.error(err);
        return a.callback(err);
      });
    };

    S['upload'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;

      a.o = _.defaults(a.o, {
        'ACL': 'private'
      , 'ContentEncoding': 'utf8'
      // Bucket
      // Key
      // infile
      , 'StorageClass': 'REDUCED_REDUNDANCY'
      , 'Body': FS.createReadStream(a.o.infile)
      , 'wait_int': false
      , 'queueSize': 10
      , 'minPartSize': 1024 * 1024 * 10
      });

      var ocb = _.once(a.cb)
        , timer = a.o.wait_int ? setTimeout(function(){
          return ocb(new Error('timeout'));
        }, a.o.wait_int) : undefined;

      return self._API.upload(_.omit(a.o, ['queueSize', 'maxTotalParts', 'minPartSize', 'wait_int', 'infile', 'progress'])
      , _.pick(['queueSize', 'maxTotalParts', 'minPartSize']))
      .on('error', ocb)
      .on('httpUploadProgress', function(stats){
         if (timer){
           clearTimeout(timer);
           timer = setTimeout(function(){
             return ocb(new Error('timeout'));
           }, a.o.wait_int);
         }

         if (process.env.VERBOSE && !a.o.progress) console.log(((stats.loaded / stats.total) * 100).toFixed(2));
         if (a.o.progress) a.o.progress(stats);
         return;
      })
      .send(function(){
        if (timer) clearTimeout(timer);
        return ocb.apply(this, arguments);
      });
    };

    S['uploadDir'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;
      a.o = _.defaults(a.o, {
      
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
          return Async.eachLimit(_.map(globals.keys, function(k){ return path +'/' + k; }), 20, function(p, _cb){
            return S.deleteFiles(bucket, p, Belt.callwrap(_cb, 0));
          }, Belt.cw(cb, 0));
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

      return Async.doWhilst(function(next){
        return Async.waterfall([
          function(cb){
            return S.readdir(bucket, path, Belt.callset(cb, globals, 'keys', 1, 0));
          }
        , function(cb){
            return Async.eachLimit(_.map(globals.keys, function(k){ return path +'/' + k; }), 20, function(p, _cb){
              return S.deleteFiles(bucket, p, Belt.callwrap(_cb, 0));
            }, Belt.cw(cb, 0));
          }
        , function(cb){
            return S.readdir(bucket, path, Belt.callset(cb, globals, 'keys', 1, 0));
          }
        ], next);
      }, function(){
        return _.any(globals.keys);
      }, function(err){
        if (err) console.error(err);
        return a.callback(err);
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

    S['listAllObjects'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;
      a.o = _.defaults(a.o, {
        'MaxKeys': 1000
        //Prefix
      });

      var res, objs = [];
      return Async.doWhilst(function(next){
        var mark = Belt.get(res, 'NextMarker');
        a.o.Marker = mark;
        return self._API.listObjects(a.o, function(err, _res){
          res = _res;
          if (err) next(err);
          objs = objs.concat(Belt.get(_res, 'Contents') || []);
          return next();
        });
      }, function(){ return res && res.IsTruncated; }
      , function(err){
        return a.cb(err, objs);
      });
    };

    S['listAllObjectVersions'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;
      a.o = _.defaults(a.o, {
        'MaxKeys': 1000
        //Prefix
      });

      var res, objs = [];
      return Async.doWhilst(function(next){
        var mark = Belt.get(res, 'NextKeyMarker');
        a.o.KeyMarker = mark;
        return self._API.listObjectVersions(a.o, function(err, _res){
          res = _res;
          if (err) next(err);
          objs = objs.concat(_res.Versions || []);
          return next();
        });
      }, function(){ return res && res.IsTruncated; }
      , function(err){
        return a.cb(err, objs);
      });
    };

    S['deleteBucket'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;
      a.o = _.defaults(a.o, {

      });

      var gb = {};
      return Async.waterfall([
        function(cb){
          return self.listAllObjectVersions(Belt.copy(a.o), Belt.cs(cb, gb, 'keys', 1, 0));
        }
      , function(cb){
          if (!_.any(gb.keys)) return cb();
          console.log(gb.keys.length);
          return Async.eachSeries(Belt.splitArray(gb.keys, 100), function(k, _cb){
            return self._API.deleteObjects({
              'Bucket': a.o.Bucket
            , 'Delete': {
                'Objects': _.map(k, function(_k){ return _.pick(_k, ['Key', 'VersionId']); })
              }
            }, function(err){ if (err) console.log(err); process.stdout.write('.'); return _cb(); });
          }, Belt.cw(cb, 0));
        }
      , function(cb){
          return self._API.deleteBucket(a.o, Belt.cw(cb, 0));
        }
      ], a.cb);
    };

    return S;
  };

  return module.exports = S3; 

}).call(this);
