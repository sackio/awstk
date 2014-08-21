# awstk

Toolkit for AWS on Node.js

## Getting Started
Install the module with: `npm install awstk`

```javascript
var awstk = require('awstk')
  , s3 = new awstk.s3({accessKeyId: "YOUR KEY"
                     , secretAccessKey: "YOUR SECRET"
                     , region: "YOUR REGION"
                     });

/*
  Some handy S3 methods, similar to Node's FS module
*/
s3.fileExists(bucket, key, callback);
s3.dirExists(bucket, key, callback);
s3.getFile(bucket, key, callback);
s3.writeFile(bucket, key, body, callback);
s3.copyFile(bucket, key, dest\_bucket, dest\_key, callback);
s3.moveFile(bucket, key, dest\_bucket, dest\_key, callback);
s3.deleteFiles(bucket, keys, callback);
s3.readdir(bucket, key, callback);
s3.rmdir(bucket, key, callback);
s3.getGzipFile(bucket, key, callback); //returns unzipped body of file
s3.writeGzipFile(bucket, key, body, callback); //compresses body and writes to S3
s3.getJSON(bucket, key, callback); //returns object from file's JSON
s3.writeJSON(bucket, key, json, callback); //stringifies and writes to S3
```

## License
Copyright (c) 2014 Ben Sack  
Licensed under the MIT license.
