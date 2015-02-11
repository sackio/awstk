'use strict';

var Awstk = require('../lib/awstk.js')
  , Optionall = require('optionall')
  , Async = require('async')
  , Path = require('path')
  , Moment = require('moment')
  , Belt = require('jsbelt')
  , _ = require('underscore')
  , O = new Optionall(Path.resolve('./'))
  , EC2 = new Awstk.ec2(_.extend({}, O.aws, {'region': 'us-west-1'}))
;

exports['aws'] = {
  setUp: function(done) {
    // setup here
    done();
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
