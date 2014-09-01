/*
  Methods for EC2 instance
*/

var Belt = require('jsbelt')
  , Async = require('async')
  , Request = require('request')
  , _ = require('underscore')
  ;

(function(){

  var Instance = function(O){
    var S = {};
    S.settings = Belt.extend({}, O);

    S['getData'] = function(prop, data, options, callback){
      var a = Belt.argulint(arguments);
      a.o = _.defaults(a.o, {

      });

      return Request.get('http://169.254.169.254/latest/' + data + '/'+prop
      , function(err, response, body){ return a.cb(err, body); });
    };

    S['getUserData'] = function(prop, options, callback){
      return S.getData(prop, 'user-data', options, callback);
    };

    S['getMetaData'] = function(prop, options, callback){
      return S.getData(prop, 'meta-data', options, callback);
    };

    return S;
  };

  return module.exports = Instance; 

}).call(this);
