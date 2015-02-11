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
        return Request(a.o.instance_data_url + '/latest/meta-data/instance-id', Belt.cs(cb, gb, 'id', 2, 0));
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
}
