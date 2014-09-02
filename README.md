# awstk

awstk is a [Node.js](http://nodejs.org) module for creating routines and workflows with [Amazon Web Services](https://aws.amazon.com)'s APIs. Awstk provides a greater level of abstraction and design patterns for templating common tasks and jobs for various AWS tools.

Currently, awstk focuses on S3, EC2, and methods for EC2 instances. Functions include filesystem-like wrappers for S3, scheduled EBS backups, watching reserved and spot instances, and more.

## Getting Started
Install the module with: `npm install awstk`

Provide you AWS credentions. Requires environmental variables of ``AMAZON_KEY``, ``AMAZON_SECRET``, and ``AMAZON_REGION``, or include a ``config.json`` file placed in the module's root path, with an object like:

```javascript
{"aws":
  { "accessKeyId": "YOUR KEY"
  , "secretAccessKey": "YOUR SECRET"
  , "region": "YOUR REGION"
  }
}
```

```javascript
var awstk = require('awstk')
  , s3 = new awstk.s3({accessKeyId: "YOUR KEY"
                     , secretAccessKey: "YOUR SECRET"
                     , region: "YOUR REGION"
                     })
  , ec2 = new awstk.ec2({accessKeyId: "YOUR KEY"
                     , secretAccessKey: "YOUR SECRET"
                     , region: "YOUR REGION"
                     });
  , instance = new awstk.ec2_instance();
```

## Methods
All methods accept optional options object and callback as last two arguments (order doesn't matter). If options are not supplied, defaults are used. If callback is not supplied, noop is used.

### S3
Methods for better using S3 as a filesystem analagous to methods provided by Node's FS module. For a true FUSE-based solution, check out [riofs](https://github.com/skoobe/riofs)

* **fileExists(bucket, key, callback)** - Check for file existence on S3 (callback receives true or false flag)
* **dirExists(bucket, key, callback)** - Check for directory existence on S3 (callback receives true or false flag). Directory denotes files stored with a shared key prefix.
* **getFile(bucket, key, options, callback)** - Retrieve a file. Include options.return_buffer to return a buffer, otherwise file is stringified and passed to callback.
* **writeFile(bucket, key, body, options, callback)** - Save a file. Body is a string of file data. Include options of acl and encoding (default to private and utf8)
* **copyFile(bucket, key, dest_bucket, dest_key, options, callback)** - Copy file from one bucket to another. Pass optional encoding and acl.
* **moveFile(bucket, key, dest_bucket, dest_key, options, callback)** - Move file from one bucket to another. Pass optional encoding and acl.
* **deleteFiles(bucket, keys, callback)** - Delete multiple files from a bucket.
* **readdir(bucket, keys, callback)** - Return files in a directory. Directory denotes files with a shared key prefix.
* **rmdir(bucket, key, callback)** - Remove directory. All files with the given key prefix are deleted.
* **getGzipFile(bucket, key, options, callback)** - Retrieve a gzipped file, inflating it and passing it to callback. Include options.return_buffer to return a buffer, otherwise inflated file is stringified.
* **writeGzipFile(bucket, key, body, options, callback)** - Gzip data and save it to a file. Body is a string of file data. Include options of acl and encoding (default to private and utf8)
* **getJSON(bucket, key, options, callback)** - Retrieves stringified JSON and parses it, sending object to callback.
* **writeJSON(bucket, key, json, options, callback)** - Stringifies an object and saves it to a file.

### EC2
Methods abstracting multi-step or polling-based routines dealing with EC2 instances, EBS volumes, and snapshots.

* **createExpiringSnapshot(volume_id, days_to_retain, options, callback)** - Create a snapshot of an EBS volume, tagged to expire after days_to_retain. Used in tandem with deleteExpiredSnapshots.
* **deleteExpiredSnapshots(callback)** - Delete expiring EBS snapshots which have expired.
* **watchInstance(instance_id, options, callback)** - Watch an instance, triggering callback when it reaches a given state. Pass options.event to specify a state (defaults to instanceStopped, also accepts instanceRunning or instanceTerminated)
* **watchSpotPrices(request, handler, stopper, options, callback)** - Watch spot prices, passing the result to handler, and stopping watch when stopper is true. Request is used to optionally filter spot prices returned
* **watchSpotRequests(request_ids, handler, stopper, options, callback)** - Watch spot requests specified as request_ids, passing the result to handler, and stopping watch when stopper is true.
* **copyVolume(volume_id, new_volume_data, options, callback)** - Copy a volume to a new volume. new_volume_data is used to specify additional settings for new volume. Pass options.new_instance to attach new volume to new_instance, including options.device as device exposed to instance. Include option.destination_region and options.source_region to copy volume to different region.
* **swapVolume(volume_id, instance_id, options, callback)** - Swap a volume from one instance to a new instance with instance_id. Include options.device as device exposed to instance (defaults to /dev/sdy).

### EC2 Instance
Methods for getting instance-specific data on an EC2 instance

* **getUserData(property, callback)** - Get an EC2 instances user-data property
* **getMetaData(property, callback)** - Get an EC2 instances meta-data property

## Scripts & Plugins
Available in ``./scripts`` directory. Scripts ready to be run from the command line.

* **create-expiring-snapshot --volume [EBS volume id] --days [days to retain snapshot]** - Create a snapshot of an EBS volume, tagged to expire after the given number of days
* **delete-expired-snapshots** - Deletes any snapshots which have an Expires tag prior to current time

## License
Copyright (c) 2014 Ben Sack  
Licensed under the MIT license.
