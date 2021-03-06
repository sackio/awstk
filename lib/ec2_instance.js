#!/usr/bin/env node

/*
  Methods for EC2 instance
*/

var Path = require('path')
  , Optionall = require('optionall')
  , FSTK = require('fstk')
  , Async = require('async')
  , _ = require('underscore')
  , Belt = require('jsbelt')
  , Util = require('util')
  , Winston = require('winston')
  , Events = require('events')
  , Request = require('request')
  , EC2 = require('./ec2.js')
  , S3 = require('./s3.js')
;

module.exports = function(O){
  var Opts = O || new Optionall({
                                  '__dirname': Path.resolve(module.filename + '/../..')
                                , 'file_priority': ['package.json', 'environment.json', 'config.json']
                                });

  var S = new (Events.EventEmitter.bind({}))();
  S.settings = Belt.extend({
    'log_level': 'info'
  , 'instance_data_url': 'http://169.254.169.254'
  }, Opts);

  S['ec2'] = new EC2(S.settings.aws);
  S['s3'] = new S3(S.settings.aws);

  var log = Opts.log || new Winston.Logger();
  if (!Opts.log) log.add(Winston.transports.Console, {'level': S.settings.log_level, 'colorize': true, 'timestamp': false});

  /*
    get this instance's id
  */
  S['getInstanceId'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'instance_data_url': self.settings.instance_data_url
    });

    return Request(a.o.instance_data_url + '/latest/meta-data/instance-id', function(err, res, body){
      return a.cb(err, body);
    });
  };

  /*
    get information on this instance
  */
  S['describeInstance'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'instance_data_url': self.settings.instance_data_url
    });

    var gb = {};
    return Async.waterfall([
      function(cb){
        return self.getInstanceId(Belt.cs(cb, gb, 'id', 1, 0));
      }
    , function(cb){
        return self.ec2._API.describeInstances({
          'InstanceIds': [gb.id]
        }, Belt.dcds(cb, gb, 'inst', 1, 'Reservations.0.Instances.0', 0));
      }
    ], function(err){
      return a.cb(err, gb.inst);
    });
  };

  /*
    terminate this instance
  */
  S['terminateInstance'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {

    });

    var gb = {};
    return Async.waterfall([
      function(cb){
        return self.describeInstance(a.o, Belt.cs(cb, gb, 'inst', 1, 0));
      }
    , function(cb){
        gb.inst_id = Belt.get(gb, 'inst.InstanceId');
        if (!gb.inst_id) return cb();

        return self.ec2._API.terminateInstances({
          'InstanceIds': [gb.inst_id]
        }, Belt.cw(cb, 0));
      }
    ], function(err){
      return a.cb(err);
    });
  };

  //////////////////////////////////////////////////////////////////////////////
  ////                           TAGS                                       ////
  //////////////////////////////////////////////////////////////////////////////

  /*
    get the value of a tag for the instance
  */
  S['describeTag'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'key': 'Name'
    });

    return self.describeInstance(a.o, function(err, inst){
      if (err) return a.cb(err);
      var val = Belt.get(_.find(Belt.get(inst, 'Tags') || [], function(t){ return Belt.get(t, 'Key') === a.o.key; }), 'Value');
      return a.cb(err, val || '');
    });
  };

  /*
    set the value of a tag for the instance
  */
  S['setTag'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'key': 'Name'
    , 'value': 'instance'
    });

    var gb = {};
    return Async.waterfall([
      function(cb){
        return self.getInstanceId(Belt.cs(cb, gb, 'id', 1, 0));
      }
    , function(cb){
        return self.ec2._API.createTags({
          'Resources': Belt.toArray(gb.id)
        , 'Tags': [
            {'Key': a.o.key, 'Value': a.o.value}
          ]
        }, Belt.cw(cb, 0));
      }
    ], a.cb);
  };

  /*
    delete a tag for the instance
  */
  S['deleteTag'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'key': 'Name'
    });

    var gb = {};
    return Async.waterfall([
      function(cb){
        return self.getInstanceId(Belt.cs(cb, gb, 'id', 1, 0));
      }
    , function(cb){
        return self.ec2._API.deleteTags({
          'Resources': Belt.toArray(gb.id)
        , 'Tags': [
            {'Key': a.o.key}
          ]
        }, Belt.cw(cb, 0));
      }
    ], a.cb);
  };

  //////////////////////////////////////////////////////////////////////////////
  ////                       EBS VOLUMES                                    ////
  //////////////////////////////////////////////////////////////////////////////

  /*
    get ebs volume id for a device
  */
  S['deviceVolumeId'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'device': '/dev/sda'
    });

    if (!Belt.call(a.o, 'device.match', /^\/dev\//)) a.o.device = '/dev/' + a.o.device;
    a.o.device = a.o.device.replace(/^\/dev\/xvd/, '/dev/sd');

    return self.describeInstance(a.o, function(err, inst){
      if (err) return a.cb(err);

      var devs = Belt.get(inst, 'BlockDeviceMappings') || []
        , id = _.find(devs, function(d){ return Belt.get(d, 'DeviceName') === a.o.device; });

      id = Belt.get(id, 'Ebs.VolumeId');

      return a.cb(id ? undefined : new Error('VolumeId not found'), id);
    });
  };

  /*
    create expiring snapshot of a device
  */
  S['createDeviceSnapshot'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'device': '/dev/sda'
    , 'days': 7 //days to wait before expiring
    , 'autoexpire': true //expire any expired snapshots on this account
    });

    var gb = {};
    return Async.waterfall([
      function(cb){
        if (!a.o.autoexpire) return cb();
        return self.ec2.deleteExpiredSnapshots(Belt.cw(cb));
      }
    , function(cb){
        return self.deviceVolumeId(a.o, Belt.cs(cb, gb, 'id', 1, 0));
      }
    , function(cb){
        return self.ec2.createExpiringSnapshot(gb.id, a.o.days, Belt.cw(cb, 0));
      }
    ], a.cb);
  };

  //////////////////////////////////////////////////////////////////////////////
  ////                                S3                                    ////
  //////////////////////////////////////////////////////////////////////////////

  S['getS3File'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'localpath': '.'
    // path - path on s3 bucket to file
    // bucket - s3 bucket
    // name - optional filename, defaults to name on s3
    // gz
    });

    if (a.o.gz) return self.getS3GzFile(a.o, a.cb);

    if (!a.o.path || !a.o.bucket) return a.cb(new Error('bucket and path are required'));

    if (!a.o.name) a.o.name = a.o.path.split('/').pop();

    return self.s3.getFile(a.o, function(err, body){
      if (err) return a.cb(err);

      var p = Path.join(a.o.localpath, '/', a.o.name);
      return FSTK.writeFile(p, body, function(err){
        return a.cb(err, p);
      });
    });
  };

  S['getS3GzFile'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'localpath': '.'
    // path - path on s3 bucket to file
    // bucket - s3 bucket
    // name - optional filename, defaults to name on s3
    });

    if (!a.o.path || !a.o.bucket) return a.cb(new Error('bucket and path are required'));

    if (!a.o.name) a.o.name = a.o.path.split('/').pop();

    return self.s3.getGzipFile(a.o, function(err, body){
      if (err) return a.cb(err);

      var p = Path.join(a.o.localpath, '/', a.o.name);
      return FSTK.writeFile(p, body, function(err){
        return a.cb(err, p);
      });
    });
  };

  S['getS3Path'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'localpath': '.'
    , 'concurrency': 10
    // path - path on s3 bucket to file
    // bucket - s3 bucket
    // name - optional filename, defaults to name on s3
    });

    if (!a.o.path || !a.o.bucket) return a.cb(new Error('bucket and path are required'));

    if (!a.o.path.match(/\/$/)) a.o.path += '/';

    var gb = {};
    return Async.waterfall([
      function(cb){
        return FSTK.mkdir(a.o.localpath, Belt.cw(cb));
      }
    , function(cb){
        return self.s3.listAllObjects({'Bucket': a.o.bucket, 'Prefix': a.o.path}
        , Belt.cs(cb, gb, 'files', 1, 0));
      }
    , function(cb){
        return Async.eachLimit(_.reject(gb.files, function(f){
          return f.Key.match(/\/$/);
        }), a.o.concurrency, function(f, _cb){
          return self.s3.getFile({
            'bucket': a.o.bucket
          , 'path': f.Key
          , 'return_buffer': true
          }, function(err, body){
            if (err) return _cb(err);

            var p = Path.join(a.o.localpath, '/', f.Key.replace(new RegExp('^' + a.o.path.replace(/\//, '\\/') + '\\/?'), ''));
            return FSTK.writeFile(p, body, function(err){
              return _cb(err);
            });
          });
        }, Belt.cw(cb, 0));
      }
    ], function(err){
      return a.cb(err, _.pluck(gb.files, 'Key'));
    });
  };

  S['putS3File'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'Bucket': a.o.bucket
    , 'Key': a.o.key || a.o.filepath.replace(/^[\/,\.]+/, '')
    , 'ACL': a.o.acl || 'private'
    //filepath
    //http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
    });

    return self.s3._API.putObject(_.extend({}, _.omit(a.o, ['filepath', '_', 'putS3File', 'key', 'bucket', 'acl', '$0']), {
      'Body': FSTK._fs.createReadStream(a.o.filepath)
    }), a.cb);
  };


  S['putS3Dir'] = function(options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'Bucket': a.o.bucket
    , 'ACL': a.o.acl || 'private'
    , 'concurrency': 30
    //dirpath
    //prefix
    });

    var gb = {};
    return Async.waterfall([
      function(cb){
        gb.rp = FSTK._fs.realpathSync(a.o.dirpath);
        if (Belt.isNull(a.o.prefix)) a.o.prefix = gb.rp.replace(/^[\/,\.]+/, '');

        return FSTK.dirPart(a.o.dirpath, Belt.dcds(cb, gb, 'files', 1, 'files', 0));
      }
    , function(cb){
        gb.prereg = new RegExp('^' + gb.rp.replace(/\//g, '\\\/').replace(/\./g, '\\\.') + '\\\/?');

        return Async.eachLimit(gb.files, a.o.concurrency, function(f, cb2){
          console.log(f.realpath);

          return self.putS3File(_.extend({}, _.omit(a.o, ['dirpath', 'prefix', 'putS3Dir', 'concurrency']), {
            'Key': f.realpath.replace(gb.prereg, a.o.prefix)
          , 'filepath': f.realpath
          , 'ContentType': f.mime
          }), Belt.cw(cb2, 0));
        }, Belt.cw(cb, 0));
      }
    ], a.cb);
  };

  return S;
};

if (require.main === module){
  var M = new module.exports();

  if (M.settings.argv.describeInstance) M.describeInstance(M.settings.argv, function(err, inst){
    if (err){ 
      console.error(err);
    } else {
      console.log(Belt.stringify(inst));
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.terminateInstance) M.terminateInstance(M.settings.argv, function(err, inst){
    if (err){ 
      console.error(err);
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.deviceVolumeId) M.deviceVolumeId(M.settings.argv, function(err, id){
    if (err){ 
      console.error(err);
    } else {
      console.log(Belt.stringify(id));
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.createDeviceSnapshot) M.createDeviceSnapshot(M.settings.argv, function(err){
    if (err){ 
      console.error(err);
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.describeTag) M.describeTag(M.settings.argv, function(err, val){
    if (err){ 
      console.error(err);
    } else {
      console.log(val);
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.setTag) M.setTag(M.settings.argv, function(err){
    if (err){ 
      console.error(err);
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.deleteTag) M.deleteTag(M.settings.argv, function(err){
    if (err){ 
      console.error(err);
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.getS3File) M.getS3File(M.settings.argv, function(err, val){
    if (err){ 
      console.error(err);
    } else {
      console.log(val);
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.getS3GzFile) M.getS3GzFile(M.settings.argv, function(err, val){
    if (err){ 
      console.error(err);
    } else {
      console.log(val);
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.getS3Path) M.getS3Path(M.settings.argv, function(err, val){
    if (err){ 
      console.error(err);
    } else {
      console.log(val);
    }
    return process.exit(err ? 1 : 0);
  });

  if (M.settings.argv.putS3File) M.putS3File(M.settings.argv, function(err, val){
    if (err){ 
      console.error(err);
    } else {
      console.log(Belt.stringify(val));
    }
    return process.exit(err ? 1 : 0);
  });


  if (M.settings.argv.putS3Dir) M.putS3Dir(M.settings.argv, function(err, val){
    if (err){ 
      console.error(err);
    }
    return process.exit(err ? 1 : 0);
  });
}
