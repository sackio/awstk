'use strict';

var Awstk = require('../lib/awstk.js')
  , Optionall = require('optionall')
  , Async = require('async')
  , Moment = require('moment')
  , Belt = require('jsbelt')
  , _ = require('underscore')
  , O = new Optionall()
  , S3 = new Awstk.s3(O.aws)
  , EC2 = new Awstk.ec2(_.extend({}, O.aws, {'region': 'us-west-1'}))
;
/*
  ======== A Handy Little Nodeunit Reference ========
  https://github.com/caolan/nodeunit

  Test methods:
    test.expect(numAssertions)
    test.done()
  Test assertions:
    test.ok(value, [message])
    test.equal(actual, expected, [message])
    test.notEqual(actual, expected, [message])
    test.deepEqual(actual, expected, [message])
    test.notDeepEqual(actual, expected, [message])
    test.strictEqual(actual, expected, [message])
    test.notStrictEqual(actual, expected, [message])
    test.throws(block, [error], [message])
    test.doesNotThrow(block, [error], [message])
    test.ifError(value)
*/

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
  },
  'ec2': function(test) {
    var globals = {
      'availability_zone': 'us-west-1b'
    , 'source_region': 'us-west-1'
    , 'ami_id': 'ami-f1fdfeb4'
    , 'instance_type': 't1.micro'
    };

    return Async.waterfall([
      //create expiring snapshot
      function(cb){
        console.log('Setup volume to play with');
        return EC2._API.createVolume({'Size': 10, 'AvailabilityZone': globals.availability_zone}, Belt.callset(cb, globals, 'volume', 1, 0));
      }
    , function(cb){
        console.log('Waiting for volume [%s] to be available', globals.volume.VolumeId);
        test.ok(globals.volume.VolumeId);
        return EC2.waitFor('volumeAvailable', {'VolumeIds': Belt.toArray(globals.volume.VolumeId)}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Create expiring snapshot');
        return EC2.createExpiringSnapshot(globals.volume.VolumeId, 30, Belt.callset(cb, globals, 'snapshot', 1, 0));
      }
    , function(cb){
        console.log('Retrieving snapshot');
        return EC2._API.describeSnapshots({'SnapshotIds': Belt.toArray(globals.snapshot)}, Belt.callset(cb, globals, 'retrieved_snapshot'));
      }
    , function(cb){
        console.log('Asserting expiring snapshot was created');

        var snapshot =  Belt._get(globals, 'retrieved_snapshot.Snapshots.0');
        test.ok(snapshot);
        test.ok(snapshot.SnapshotId === globals.snapshot);
        test.ok(snapshot.State === 'completed');

        var tags = EC2.tag_obj(snapshot.Tags);

        test.ok(tags.Volume === globals.volume.VolumeId);
        test.ok(tags.Retain === '30:days');
        test.ok(tags.Expires && Moment(tags.Expires, 'X').fromNow(true) === 'a month');

        return cb();
      }
    , function(cb){
        console.log('Deleting snapshot');
        return EC2._API.deleteSnapshot({'SnapshotId': globals.snapshot}, Belt.callwrap(cb, 0));
      }

      //delete expiring snapshots
    , function(cb){
        globals.expires = Moment().subtract(90, 'days');

        return EC2._API.createSnapshot({'VolumeId': globals.volume.VolumeId
          , 'Description': globals.volume.VolumeId + ' BACKUP (Expires ' + globals.expires.format('MM-DD-YYYY')
          + ' | Retained 20 days)'}
        , Belt.callset(cb, globals, 'response', 1, 0));
      }
    , function(cb){
        globals.snapshot = Belt._get(globals, 'response.SnapshotId');
        return cb(!globals.snapshot ? new Error('Snapshot not created') : null);
      }
    , function(cb){
        return EC2._API.createTags({'Resources': Belt.toArray(globals.snapshot), 'Tags': 
            [ {'Key': 'Expires', 'Value': Belt._call(globals, 'expires.format', 'X')}
            , {'Key': 'Retain', 'Value': '20:days'}
            , {'Key': 'Volume', 'Value': globals.volume.VolumeId}
            , {'Key': 'Name', 'Value': globals.volume.VolumeId + ' BACKUP (Expires ' + globals.expires.format('MM-DD-YYYY')}
            ]}, Belt.callwrap(cb, 0));
      }
    , function(cb){
       return EC2.waitFor('snapshotCompleted', {'SnapshotIds': Belt.toArray(globals.snapshot)}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Create expiring snapshot');
        return EC2.createExpiringSnapshot(globals.volume.VolumeId, 30, Belt.callset(cb, globals, 'snapshot_b', 1, 0));
      }
    , function(cb){
        console.log('Asserting both snapshots were created');
        return EC2._API.describeSnapshots({'SnapshotIds': [globals.snapshot, globals.snapshot_b]}, Belt.callset(cb, globals, 'retrieved_snapshots', 1, 0));
      }
    , function(cb){
        test.ok(globals.retrieved_snapshots.Snapshots.length === 2);
        return cb();
      }
    , function(cb){
        console.log('Deleting expired snapshots');
        return EC2.deleteExpiredSnapshots(Belt.callwrap(cb, 0));
      }

    , function(cb){
        console.log('Asserting both snapshots were created');
        return EC2._API.describeSnapshots({'Filters': [{Name: 'tag-key', Values: ['Expires']}]}, Belt.callset(cb, globals, 'retrieved_snapshots', 1, 0));
      }
    , function(cb){
        test.ok(globals.retrieved_snapshots.Snapshots.length === 1);
        test.ok(globals.retrieved_snapshots.Snapshots[0].SnapshotId === globals.snapshot_b);
        return cb();
      }
    , function(cb){
        console.log('Deleting snapshot');
        return EC2._API.deleteSnapshot({'SnapshotId': globals.snapshot_b}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Deleting volume');
        return EC2._API.deleteVolume({'VolumeId': globals.volume.VolumeId}, Belt.callwrap(cb, 0));
      }

      //watchInstances
    , function(cb){
        console.log('Creating instance to watch');
        return EC2._API.runInstances({'ImageId': globals.ami_id, 'MinCount': 1, 'MaxCount': 1, 'InstanceType': globals.instance_type}
               , Belt.callset(cb, globals, 'instances', 1, 0));
      }
    , function(cb){
        console.log('Asserting instance was created');
        globals.instance_id = Belt._get(globals, 'instances.Instances.0.InstanceId');
        test.ok(typeof globals.instance_id !== 'undefined');
        return cb();
      }
    , function(cb){
        console.log('Watching instance until it is started');
        return EC2.watchInstance(globals.instance_id, {'event': 'instanceRunning'}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Instance started and watch was triggered');
        return EC2._API.describeInstances({'InstanceIds': [globals.instance_id]}, Belt.callset(cb, globals, 'instance_status', 1, 0));
      }
    , function(cb){
        console.log('Asserting instance is running');
        var instance = Belt._get(globals, 'instance_status.Reservations.0.Instances.0');
        test.ok(instance && instance.InstanceId === globals.instance_id && instance.State.Name === 'running');
        return cb();
      }
    , function(cb){
        console.log('Stopping instance');
        EC2.watchInstance(globals.instance_id, Belt.callwrap(cb, 0));
        return EC2._API.stopInstances({'InstanceIds': [globals.instance_id]}, Belt.noop);
      }
    , function(cb){
        console.log('Instance stopped and watch was triggered');
        return EC2._API.describeInstances({'InstanceIds': [globals.instance_id]}, Belt.callset(cb, globals, 'instance_status', 1, 0));
      }
    , function(cb){
        console.log('Asserting instance was stopped');
        var instance = Belt._get(globals, 'instance_status.Reservations.0.Instances.0');
        test.ok(instance && instance.InstanceId === globals.instance_id && instance.State.Name === 'stopped');
        return cb();
      }
    , function(cb){
        console.log('Terminating instance');
        EC2.watchInstance(globals.instance_id, {'event': 'instanceTerminated'}, Belt.callwrap(cb, 0));
        return EC2._API.terminateInstances({'InstanceIds': [globals.instance_id]}, Belt.noop);
      }
    , function(cb){
        console.log('Instance terminated and watch was triggered');
        test.ok(true);
        return cb();
      }

      //watchSpotPrices

      //watchSpotRequests

      //copyVolume
    , function(cb){
        console.log('Creating instances');
        return EC2._API.runInstances({'ImageId': globals.ami_id, 'MinCount': 2, 'MaxCount': 2, 'InstanceType': globals.instance_type
               , 'Placement': {'AvailabilityZone': globals.availability_zone}}
               , Belt.callset(cb, globals, 'instances', 1, 0));
      }
    , function(cb){
        console.log('Asserting instances were created');
        globals.instance_id_a = Belt._get(globals, 'instances.Instances.0.InstanceId');
        globals.instance_id_b = Belt._get(globals, 'instances.Instances.1.InstanceId');
        globals.instance_zone_a = Belt._get(globals, 'instances.Instances.0.Placement.AvailabilityZone');
        globals.instance_zone_b = Belt._get(globals, 'instances.Instances.1.Placement.AvailabilityZone');
        test.ok(typeof globals.instance_id_a !== 'undefined');
        test.ok(typeof globals.instance_id_b !== 'undefined');
        return cb();
      }
    , function(cb){
        console.log('Watching instances until they are started');
        return EC2.watchInstance(globals.instance_id_a, {'event': 'instanceRunning'}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        return EC2.watchInstance(globals.instance_id_b, {'event': 'instanceRunning'}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Setup volumes a');
        return EC2._API.createVolume({'Size': 10, 'AvailabilityZone': globals.instance_zone_a}, Belt.callset(cb, globals, 'volume_a', 1, 0));
      }
    , function(cb){
        console.log('Waiting for volume [%s] to be available', globals.volume_a.VolumeId);
        test.ok(globals.volume_a.VolumeId);
        return EC2.waitFor('volumeAvailable', {'VolumeIds': Belt.toArray(globals.volume_a.VolumeId)}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Attaching volume to instance A');
        return EC2._API.attachVolume({'VolumeId': globals.volume_a.VolumeId, 'InstanceId': globals.instance_id_a, 'Device': '/dev/sdz'}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Waiting for volume [%s] to be in use', globals.volume_a.VolumeId);
        return EC2.waitFor('volumeInUse', {'VolumeIds': Belt.toArray(globals.volume_a.VolumeId)}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Copying volume to instance B');
        return EC2.copyVolume(globals.volume_a.VolumeId, {'AvailabilityZone': globals.instance_zone_b}, {'new_instance': globals.instance_id_b}
               , Belt.callset(cb, globals, 'volume_b', 1, 0));
      }
    , function(cb){
        test.ok(globals.volume_b);
        return cb();
      }
    , function(cb){
        return EC2._API.describeInstances({'InstanceIds': [globals.instance_id_b]}, Belt.callset(cb, globals, 'instance_b', 1, 0));
      }
    , function(cb){
        globals.instance_b = Belt._get(globals, 'instance_b.Reservations.0.Instances.0');
        test.ok(globals.instance_b.BlockDeviceMappings[1].Ebs.VolumeId === globals.volume_b);
        return cb();
      }
    , function(cb){
        console.log('Swapping volume');
        return EC2.swapVolume(globals.volume_a.VolumeId, globals.instance_id_b, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Asserting volume was swapped');
        return EC2._API.describeInstances({'InstanceIds': [globals.instance_id_b]}, Belt.callset(cb, globals, 'instance_b', 1, 0));
      }
    , function(cb){
        globals.instance_b = Belt._get(globals, 'instance_b.Reservations.0.Instances.0');
        test.ok(globals.instance_b.BlockDeviceMappings.length === 3);
        return cb();
      }
    , function(cb){
        return EC2._API.describeInstances({'InstanceIds': [globals.instance_id_a]}, Belt.callset(cb, globals, 'instance_a', 1, 0));
      }
    , function(cb){
        globals.instance_a = Belt._get(globals, 'instance_a.Reservations.0.Instances.0');
        test.ok(globals.instance_a.BlockDeviceMappings.length === 1);
        return cb();
      }
    , function(cb){
        console.log('Terminating instance');
        return EC2._API.terminateInstances({'InstanceIds': [globals.instance_id_a, globals.instance_id_b]}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Watching instances until they are terminated');
        return EC2.watchInstance(globals.instance_id_a, {'event': 'instanceTerminated'}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        return EC2.watchInstance(globals.instance_id_b, {'event': 'instanceTerminated'}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        console.log('Detaching volumes');
        return EC2._API.detachVolume({'VolumeId': globals.volume_a.VolumeId}, Belt.callwrap(cb));
      }
    , function(cb){
        return EC2._API.detachVolume({'VolumeId': globals.volume_b}, Belt.callwrap(cb));
      }
    , function(cb){
        console.log('Deleting volumes');
        return EC2._API.deleteVolume({'VolumeId': globals.volume_a.VolumeId}, Belt.callwrap(cb, 0));
      }
    , function(cb){
        return EC2._API.deleteVolume({'VolumeId': globals.volume_b}, Belt.callwrap(cb, 0));
      }
    ], function(err){
      if (err) console.error(err);
      test.ok(!err);
      return test.done();
    });
  }
};
