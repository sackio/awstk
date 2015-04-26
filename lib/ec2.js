/*
  Methods for EC2
*/

var Belt = require('jsbelt')
  , Async = require('async')
  , Moment = require('moment')
  , AWS = require('aws-sdk')
  , _ = require('underscore')
  ;

(function(){

  var EC2 = function(O){
    var S = {};

    S.settings = Belt.extend({}, O);
    S._API = new AWS.EC2(S.settings);

    S['tag_obj'] = function(tags){
      if (!_.any(tags)) return {};
      return _.object(_.pluck(tags, 'Key'), _.pluck(tags, 'Value'));
    };

    S['poll'] = function(method, request, pStr, value, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};
      a.o = _.defaults(Belt.copy(a.o), {
        'timeout': 100
      , 'interval': 5000
      , 'override_error': true
      });

      globals.iteration = 0;
      return Async.whilst(function(){ return !globals.stop; }
      , function(cb){
        console.log('...polling...');

        if (globals.iteration > a.o.timeout) return cb(new Error('Poll timed out'));
        globals.iteration++;

        return S._API[method](request, function(err, response){
          if (err) console.log(err);
          if (!a.o.override_error && err) return cb(err);

          if (Belt._get(response, pStr) === value){
            globals.stop = true;
            globals.response = response;
            return cb();
          }

          return setTimeout(cb, a.o.interval);
        });
      }, function(err){
        return a.cb(err, globals.response);
      });
    };

    S['waitFor'] = function(prop, request, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};
      a.o = _.defaults(a.o, {

      });

      if (prop === 'instanceRunning'){
        return S.poll('describeInstances', request, 'Reservations.0.Instances.0.State.Name', 'running', a.o, a.cb);

      } else if (prop === 'instanceStopped'){
        return S.poll('describeInstances', request, 'Reservations.0.Instances.0.State.Name', 'stopped', a.o, a.cb);

      } else if (prop === 'instanceTerminated'){
        return S.poll('describeInstances', request, 'Reservations.0.Instances.0.State.Name', 'terminated', a.o, a.cb);

      } else if (prop === 'snapshotCompleted'){
        return S.poll('describeSnapshots', request, 'Snapshots.0.State', 'completed', a.o, a.cb);

      } else if (prop === 'volumeAvailable'){
        return S.poll('describeVolumes', request, 'Volumes.0.State', 'available', a.o, a.cb);

      } else if (prop === 'volumeInUse'){
        return S.poll('describeVolumes', request, 'Volumes.0.State', 'in-use', a.o, a.cb);

      } else if (prop === 'volumeDeleted'){
        return S.poll('describeVolumes', request, 'Volumes.0.State', 'deleted', a.o, a.cb);
      }

      return a.cb(new Error('Property is invalid'));
    };

    S['createExpiringSnapshot'] = function(volume_id, days_to_retain, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};
      a.o = _.defaults(a.o, {
        'expires': Moment().add(days_to_retain, 'days')
      });

      return Async.waterfall([
        function(cb){
          return S._API.createSnapshot({'VolumeId': volume_id
            , 'Description': volume_id + ' BACKUP (Expires ' + a.o.expires.format('MM-DD-YYYY')
            + ' | Retained ' + days_to_retain + ' days)'}
          , Belt.callset(cb, globals, 'response', 1, 0));
        }
      , function(cb){
          globals.snapshot = Belt._get(globals, 'response.SnapshotId');
          return cb(!globals.snapshot ? new Error('Snapshot not created') : null);
        }
      , function(cb){
          return S._API.createTags({'Resources': Belt.toArray(globals.snapshot), 'Tags': 
              [ {'Key': 'Expires', 'Value': Belt._call(a, 'o.expires.format', 'X')}
              , {'Key': 'Retain', 'Value': days_to_retain + ':days'}
              , {'Key': 'Volume', 'Value': volume_id}
              , {'Key': 'Name', 'Value': volume_id + ' BACKUP (Expires ' + a.o.expires.format('MM-DD-YYYY')}
              ]}, Belt.callwrap(cb, 0));
        }
      , function(cb){
          if (a.o.no_wait) return cb();

          return S.waitFor('snapshotCompleted', {'SnapshotIds': Belt.toArray(globals.snapshot)}
                 , Belt.callwrap(cb, 0));
        }
      ], function(err){
        return a.cb(err, globals.snapshot);
      });
    };

    S['deleteExpiredSnapshots'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};
      a.o = _.defaults(a.o, {
        'now': Moment()
      });

      return Async.waterfall([
        function(cb){
          return S._API.describeSnapshots({'Filters': [{Name: 'tag-key', Values: ['Expires']}]}
          , Belt.callset(cb, globals, 'response', 1, 0));
        }
      , function(cb){
          globals.snapshots = Belt._get(globals, 'response.Snapshots');
          return cb(!_.any(globals.snapshots) ? null : null);
        }
      , function(cb){
          return Async.eachSeries(globals.snapshots, function(s, _cb){
            console.log('Checking ' + s.SnapshotId + '...');

            var exp = _.find(s.Tags, function(t){ return t.Key === 'Expires'; });
            if (!exp) return _cb();
            exp = Moment(exp.Value, 'X');

            if (!exp.isBefore(a.o.now)){
              console.log('...expires at ' + exp.format('HH:mm | MM-DD-YYYY'));
              return _cb();
            }

            console.log('...expired at ' + exp.format('HH:mm | MM-DD-YYYY')
                       + '. Deleting...');

            return S._API.deleteSnapshot({'SnapshotId': s.SnapshotId}
                    , Belt.callwrap(_cb));
          }, Belt.callwrap(cb, 0));
        }
      ], Belt.callwrap(a.cb, 0));
    };

    S['watchInstance'] = function(instance_id, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};
      a.o = _.defaults(a.o, {
        'event': 'instanceStopped'
      });

      return S.waitFor(a.o.event, {'InstanceIds': Belt.toArray(instance_id)}
                           , a.cb);
    };

    /*
      Pass test the arguments from describeSpotPriceHistory
      Watch continues until stopper is set to true
    */
    S['watchSpotPrices'] = function(request, handler, stopper, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {}, req = request || {};
      a.o = _.defaults(a.o, {
        'watch_interval': 1500
      });
      return Async.whilst(function(){ return !stopper; }
                  , function(cb){
                      return S._API.describeSpotPriceHistory(request, function(err, result){
                        handler.apply(this, arguments);
                        return setTimeout(cb, a.o.interval);
                      });
                    }
                  , a.cb);
    };

    S['watchSpotRequests'] = function(request_ids, handler, stopper, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {}, req = {'SpotInstanceRequestIds': Belt.toArray(request_ids)};
      a.o = _.defaults(a.o, {
        'watch_interval': 1500
      });
      return Async.whilst(function(){ return !stopper; }
                  , function(cb){
                      return S._API.describeSpotInstanceRequests(req, function(err, result){
                        handler.apply(this, arguments);
                        return setTimeout(cb, a.o.interval);
                      });
                    }
                  , a.cb);
    };

    S['copyVolume'] = function(volume_id, new_volume, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};
      a.o = _.defaults(a.o, {
        'source_region': false
      , 'destination_region': false
      , 'new_instance': false
      , 'device': '/dev/sdz'
      });

      new_volume = new_volume || {};

      return Async.waterfall([
        function(cb){
          return S._API.createSnapshot({'VolumeId': volume_id}
          , Belt.callset(cb, globals, 'response', 1, 0));
        }
      , function(cb){
          globals.snapshot = Belt._get(globals, 'response.SnapshotId');
          return cb(!globals.snapshot ? new Error('Snapshot not created') : null);
        }
      , function(cb){
          return S.waitFor('snapshotCompleted', {'SnapshotIds': Belt.toArray(globals.snapshot)}
                 , Belt.callwrap(cb, 0));
        }
      , function(cb){
          if (!a.o.destination_region) return cb();

          return S._API.copySnapshot({'SourceRegion': a.o.source_region
                                    , 'SourceSnapshotId': globals.snapshot
                                    , 'DestinationRegion': a.o.destination_region}
          , Belt.callset(cb, globals, 'response', 1, 0));
        }
      , function(cb){
          globals.snapshot = Belt._get(globals, 'response.SnapshotId');
          return cb(!globals.snapshot ? new Error('Snapshot not copied to new region') : null);
        }
      , function(cb){
          return S.waitFor('snapshotCompleted', {'SnapshotIds': Belt.toArray(globals.snapshot)}
                 , Belt.callwrap(cb, 0));
        }
      , function(cb){
          return S._API.createVolume(_.extend({}, new_volume, {'SnapshotId': globals.snapshot})
          , Belt.callset(cb, globals, 'response', 1, 0));
        }
      , function(cb){
          globals.volume = Belt._get(globals, 'response.VolumeId');
          return cb(!globals.volume ? new Error('Volume not created') : null);
        }
      , function(cb){
          return S.waitFor('volumeAvailable', {'VolumeIds': Belt.toArray(globals.volume)}
                 , Belt.callwrap(cb, 0));
        }
      , function(cb){
          if (!a.o.new_instance) return cb();

          return S._API.attachVolume({'VolumeId': globals.volume, 'InstanceId': a.o.new_instance, 'Device': a.o.device}
          , Belt.callset(cb, globals, 'response', 1, 0));
        }
      , function(cb){
          if (!a.o.new_instance) return cb();

          return S.waitFor('volumeInUse', {'VolumeIds': Belt.toArray(globals.volume)}
                 , Belt.callwrap(cb, 0));
        }
      , function(cb){
          return S._API.deleteSnapshot({'SnapshotId': globals.snapshot}, Belt.callwrap(cb, 0));
        }
      ], function(err){
        return a.cb(err, globals.volume);
      });
    };

    S['swapVolume'] = function(volume_id, instance_id, options, callback){
      var a = Belt.argulint(arguments)
        , globals = {};
      a.o = _.defaults(a.o, {
        'device': '/dev/sdy'
      });

      return Async.waterfall([
        function(cb){
          return S._API.detachVolume({'VolumeId': volume_id}
          , Belt.callwrap(cb));
        }
      , function(cb){
          return S.waitFor('volumeAvailable', {'VolumeIds': Belt.toArray(volume_id)}
                 , Belt.callwrap(cb, 0));
        }
      , function(cb){
          return S._API.attachVolume({'VolumeId': volume_id, 'InstanceId': instance_id, 'Device': a.o.device}
                 , Belt.callwrap(cb, 0));
        }
      , function(cb){
          return S.waitFor('volumeInUse', {'VolumeIds': Belt.toArray(volume_id)}
                 , Belt.callwrap(cb, 0));
        }
      ], Belt.callwrap(a.cb, 0));
    };

    S['describeInstances'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;
      a.o = _.defaults(a.o, {
        'gb': {}
      , 'MaxResults': a.o.InstanceIds ? undefined : 1000
      , 'retry_timeout': 5000
      , 'max_ids': 100
      , 'request_limit': 4
      , 'omit_options': ['omit_options', '--', '0', 'gb', 'retry_timeout', 'max_ids'
                        , 'request_limit', 'skip_instance_statuses', 'skip_spot_requests']
      });

      a.o.gb.instances = [];

      return Async.waterfall([
        function(cb){
          return Async.doWhilst(function(next){
            S._API.describeInstances(_.omit(a.o, a.o.omit_options), function(err, data){
              if (err) return setTimeout(next, a.o.retry_timeout);

              if (data.NextToken){
                a.o.NextToken = data.NextToken;
              } else {
                a.o.gb.stop = true;
              }

              a.o.gb.instances = a.o.gb.instances.concat(_.flatten(_.pluck(data.Reservations, 'Instances')));

              return next();
            });
            return;
          }, function(){ return !a.o.gb.stop; }
          , Belt.cw(cb, 0));
        }
      , function(cb){
          if (!_.any(a.o.gb.instances) || a.o.skip_instance_statuses) return cb();

          return Async.eachLimit(Belt.splitArray(a.o.gb.instances, a.o.max_ids)
          , a.o.request_limit, function(req, _cb){
            var _gb = {};
            return Async.doWhilst(function(next){
              return S._API.describeInstanceStatus({'InstanceIds': _.pluck(req, 'InstanceId'), 'IncludeAllInstances': true}
              , function(err, instances){
                _gb.err = err;
                if (err) return setTimeout(next, a.o.retry_timeout);

                _.each(Belt.get(instances, 'InstanceStatuses') || [], function(i){
                  var instance = _.find(a.o.gb.instances, function(_i){ return i.InstanceId === _i.InstanceId; });
                  if (!instance) return;
                  return instance['$Status'] = i;
                });

                return next();
              });
            }, function(){ return _gb.err; }
            , Belt.cw(_cb, 0));
          }, Belt.cw(cb, 0));
        }
      , function(cb){
          if (!_.any(a.o.gb.instances) || a.o.skip_spot_requests) return cb();

          var spot_reqs = _.chain(a.o.gb.instances)
                           .pluck('SpotInstanceRequestId')
                           .compact()
                           .value();

          return Async.eachLimit(Belt.splitArray(spot_reqs, a.o.max_ids)
          , a.o.request_limit, function(req, _cb){
            var _gb = {};
            return Async.doWhilst(function(next){
              return S._API.describeSpotInstanceRequests({'SpotInstanceRequestIds': req}, function(err, srs){
                _gb.err = err;
                if (err) return setTimeout(next, a.o.retry_timeout);

                _.each(Belt.get(srs, 'SpotInstanceRequests') || [], function(r){
                  var instance = _.find(a.o.gb.instances, function(_i){
                    return r.SpotInstanceRequestId === _i.SpotInstanceRequestId;
                  });
                  if (!instance) return;
                  return instance['$SpotRequest'] = r;
                });

                return next();
              });
            }, function(){ return _gb.err; }
            , Belt.cw(_cb, 0));
          }, Belt.cw(cb, 0));
        }
      ], function(err){
        return a.cb(err, a.o.gb.instances.length);
      });
    };

    S['describeSpotRequests'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;
      a.o = _.defaults(a.o, {
        'gb': {}
      , 'retry_timeout': 5000
      , 'max_ids': 100
      , 'request_limit': 4
      , 'omit_options': ['omit_options', '--', '0', 'gb', 'retry_timeout', 'max_ids'
                        , 'skip_instance_statuses', 'skip_instances', 'request_limit']
      });

      a.o.gb.spot_requests = [];

      return Async.waterfall([
        function(cb){
          return Async.doWhilst(function(next){
            S._API.describeSpotInstanceRequests(_.omit(a.o, a.o.omit_options), function(err, data){
              if (err) return setTimeout(next, a.o.retry_timeout);

              if (data.NextToken){
                a.o.NextToken = data.NextToken;
              } else {
                a.o.gb.stop = true;
              }

              a.o.gb.spot_requests = a.o.gb.spot_requests.concat(data.SpotInstanceRequests || []);

              return next();
            });
            return;
          }, function(){ return !a.o.gb.stop; }
          , Belt.cw(cb, 0));
        }
      , function(cb){
          if (!_.any(a.o.gb.spot_requests) || a.o.skip_instances) return cb();

          var instances = _.chain(a.o.gb.spot_requests)
                           .pluck('InstanceId')
                           .compact()
                           .value();

          return Async.eachLimit(Belt.splitArray(instances, a.o.max_ids)
          , a.o.request_limit, function(req, _cb){
            var _gb = {};
            return Async.doWhilst(function(next){
              return S._API.describeInstances({'InstanceIds': req}, function(err, data){
                _gb.err = err;
                if (err) return setTimeout(next, a.o.retry_timeout);

                _.each(_.flatten(_.pluck(data.Reservations, 'Instances')) || [], function(i){
                  var sr = _.find(a.o.gb.spot_requests, function(r){
                    return r.InstanceId === i.InstanceId;
                  });
                  if (!sr) return;
                  return sr['$Instance'] = i;
                });

                return next();
              });
            }, function(){ return _gb.err; }
            , Belt.cw(_cb, 0));
          }, Belt.cw(cb, 0));
        }
      , function(cb){
          if (!_.any(a.o.gb.spot_requests) || a.o.skip_instances || a.o.skip_instance_statuses)
            return cb();

          var instances = _.chain(a.o.gb.spot_requests)
                           .pluck('InstanceId')
                           .compact()
                           .value();

          return Async.eachLimit(Belt.splitArray(instances, a.o.max_ids)
          , a.o.request_limit, function(req, _cb){
            var _gb = {};
            return Async.doWhilst(function(next){
              return S._API.describeInstanceStatus({'InstanceIds': req, 'IncludeAllInstances': true}
              , function(err, instances){
                _gb.err = err;
                if (err) return setTimeout(next, a.o.retry_timeout);

                _.each(Belt.get(instances, 'InstanceStatuses') || [], function(i){
                  var sr = _.find(a.o.gb.spot_requests, function(r){ return i.InstanceId === r.InstanceId; });
                  if (!sr) return;
                  return sr['$InstanceStatus'] = i;
                });

                return next();
              });
            }, function(){ return _gb.err; }
            , Belt.cw(_cb, 0));
          }, Belt.cw(cb, 0));
        }
      ], function(err){
        return a.cb(err, a.o.gb.spot_requests);
      });
    };

    S['terminateInstances'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;
      a.o = _.defaults(a.o, {
        'gb': {}
      , 'retry_timeout': 5000
      , 'watch_timeout': 30000
      , 'max_ids': 100
      , 'request_limit': 4
      , 'omit_options': ['omit_options', '--', '0', 'gb', 'retry_timeout', 'max_ids'
                        , 'request_limit', 'watch_timeout']
      , 'InstanceIds': []
      });

      return Async.eachLimit(Belt.splitArray(a.o.InstanceIds, a.o.max_ids)
      , a.o.request_limit, function(ids, cb){
        return Async.doWhilst(function(next(){
          return Async.waterfall([
            function(_cb){
              return S._API.terminateInstances({'InstanceIds': ids}
              , function(){ return setTimeout(Belt.cw(_cb), a.o.retry_timeout); });
            }
          , function(_cb){
              return S._API.describeInstanceStatus({'InstanceIds': ids, 'IncludeAllInstances': true}, _cb);
            }
        ], function(err, statuses){
          if (err || !_.any(Belt.get(status, 'InstanceStatuses')) || !_.every(ids, function(i){
            return _.find(statuses.InstanceStatuses, function(s){
              return s.InstanceId === i && Belt.get(s, 'InstanceState.Name') === 'terminated';
            });
          })) return setTimeout(next, a.o.watch_timeout);

          gb.stop = true;
          return cb();
        });
      }, function(){ return !a.o.gb.stop; }
      , Belt.cw(a.cb, 0));
    };

    S['terminateSpotRequests'] = function(options, callback){
      var a = Belt.argulint(arguments)
        , self = this;
      a.o = _.defaults(a.o, {
        'gb': {}
      , 'retry_timeout': 5000
      , 'watch_timeout': 30000
      , 'max_ids': 100
      , 'request_limit': 4
      , 'omit_options': ['omit_options', '--', '0', 'gb', 'retry_timeout', 'max_ids'
                        , 'request_limit', 'watch_timeout']
      , 'SpotInstanceRequestIds': []
      });

      return Async.eachLimit(Belt.splitArray(a.o.SpotInstanceRequestIds, a.o.max_ids)
      , a.o.request_limit, function(ids, cb){
        return Async.doWhilst(function(next(){
          return Async.waterfall([
            function(_cb){
              return S._API.cancelSpotInstanceRequests({'SpotInstanceRequestIds': ids}
              , function(){ return setTimeout(Belt.cw(_cb), a.o.retry_timeout); });
            }
          , function(_cb){
              return S._API.describeSpotInstanceRequests({'SpotInstanceRequests': ids}, _cb);
            }
        ], function(err, statuses){
          if (err || !_.any(Belt.get(status, 'SpotInstanceRequests')) || !_.every(ids, function(i){
            return _.find(statuses.SpotInstanceRequests, function(s){
              return s.SpotInstanceRequestId === i && Belt.get(s, 'Status.Code') === 'cancelled';
            });
          })) return setTimeout(next, a.o.watch_timeout);

          gb.stop = true;
          return cb();
        });
      }, function(){ return !a.o.gb.stop; }
      , Belt.cw(a.cb, 0));
    };

    S['fullyTerminateInstances'] = function(options, callback){

    };

    S['fullyTerminateSpotRequests'] = function(options, callback){

    };

    return S;
  };

  return module.exports = EC2; 

}).call(this);
