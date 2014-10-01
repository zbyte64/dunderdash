/*
// Example usage:
var __ = require('dunderdash').__;

__.method('map', signatureDispatcher, typeof {}, _.map);
__.method('map', signatureDispatcher, typeof [], _.map);
__.methodDefault('map', null);
__.methodWithArgs('fib', 0, 0);
__.methodWithArgs('fib', 1, 1);
__.methodDefault('fib', function(n) {
  return this.fib(n-1) + this.fib(n-2);
});
__.methodWithSignature('map', typeof {}, _.map)


//custom dispatcher in place
//CONSIDER: interface alternative!
__.methodClassifier('sendMessage', function(contant) {return contact.server});
__.methodWithClassification('sendMessage', 'twitter', function() {});
*/

define("dunderdash", ["buckets.js", "exports"], function(buckets, exports) {

  function constantF(val) {
    if (typeof(val) === "function") return val;
    return function() {return val};
  };


  function namespace() {
    /* hashing utilities */
    function hide(obj, prop) {
      // Make non iterable if supported
      if (Object.defineProperty) {
        Object.defineProperty(obj, prop, {enumerable:false});
      }
    };

    function type(key) {
      var str = Object.prototype.toString.call(key);
      var type = str.slice(8, -1).toLowerCase();
      // Some browsers yield DOMWindow for null and undefined, works fine on Node
      if (type === 'domwindow' && !key) {
        return key + '';
      }
      return type;
    }

    var uid = 0;

    function hash(key) {
      switch (this.type(key)) {
        case 'undefined':
        case 'null':
        case 'boolean':
        case 'number':
        case 'regexp':
          return key + '';
        case 'date':
          return ':' + key.getTime();
        case 'string':
          return '"' + key;
        case 'array':
          var hashes = [];
          for (var i = 0; i < key.length; i++)
            hashes[i] = hash(key[i]);
          return '[' + hashes.join('|');
        case 'object':
        default:
          // TODO: Don't use expandos when Object.defineProperty is not available?
          if (!key._hmuid_) {
            key._hmuid_ = ++uid;
            hide(key, '_hmuid_');
          }
          return '{' + key._hmuid_;
      }
    }

    /* state */
    var functions = new buckets.Dictionary(hash);
    var priorities = new buckets.BSTree(function (a, b) {
      if (a.priority < b.priority) return -1;
      if (a.priority > b.priority) return 1;
      return 0;
    });

    /* public methods */
    this.method = function(funcName, funcRouter, _$) {
      if (!functions.containsKey(funcName)) {
        if (this[funcName]) {
          throw new Error("Name already reserved: "+funcName);
        }
        functions.set(funcName, new buckets.Dictionary(hash));
        this[funcName] = this.dispatch.bind(this, funcName);
      }
      var dispatchRegistry = functions.get(funcName);
      if (!dispatchRegistry.containsKey(funcRouter)) {
        dispatchRegistry.set(funcRouter, []);
      }
      var args = Array.prototype.slice.call(arguments, 2);
      dispatchRegistry.get(funcRouter).push(args);
    };
    this.dispatch = function(funcName, _$) {
      if (!functions.containsKey(funcName)) {
        throw new Error("Unknown method: "+funcName);
      }
      var dispatchRegistry = functions.get(funcName);
      var dispatchers = dispatchRegistry.keys();
      var args = Array.prototype.slice.call(arguments, 1);
      var seen = new buckets.Set(hash);

      var retVal, found;
      priorities.forEach(function(d) {
        var dispatcher = d.dispatcher;
        seen.add(dispatcher);
        var dispatcherArgs = dispatchRegistry.get(dispatcher);
        if (dispatcherArgs === undefined) return;
        var f = dispatcher(dispatcherArgs, args);
        if (f) {
          retVal = f.apply(this, args);
          found = true;
          return false;
        }
      });
      if(found) return retVal;

      for (var i=0; i<dispatchers.length; i++) {
        var dispatcher = dispatchers[i];
        if (seen.contains(dispatcher)) continue;
        var dispatcherArgs = dispatchRegistry.get(dispatcher);
        var f = dispatcher(dispatcherArgs, args);
        if (f) return f.apply(this, args);
      }
      //TODO default
      throw new Error("Could not resolve method signature: "+funcName, args);
    };
    this.prioritizeDispatcher = function(dispatcher, priority) {
      //idealy an array ordered by priority
      priorities.add({dispatcher: dispatcher, priority: priority});
    };
  };

  /* dispatchers */
  function defaultDispatcher(dispatcherArgs, args) {
    return constantF(dispatcherArgs[0]);
  };

  function argDispatcher(dispatcherArgs, args) {
    var dArgs = dispatcherArgs.slice(0, dispatcherArgs.length-2);
    if (buckets.arrays.equals(dArgs, args)) {
      return constantF(dispatcherArgs[dispatcherArgs.length-1]);
    }
  };

  function signatureDispatcher(dispatcherArgs, args) {
    var dArgs = dispatcherArgs.slice(0, dispatcherArgs.length-2);
    var tArgs = args.map(typeof);
                         if (buckets.arrays.equals(dArgs, tArgs)) {
      return constantF(dispatcherArgs[dispatcherArgs.length-1]);
    }
  };


  var __ = namespace();
  __.prioritizeDispatcher(defaultDispatcher, 1000);
  __.prioritizeDispatcher(argDispatcher, 10);
  __.prioritizeDispatcher(signatureDispatcher, 50);

  __.method('methodDefault', function(dArgs, args) {
    //method, default = dArgs;
    return this.method(dArgs[0], defaultDispatcher, dArgs[1]);
  });

  __.method('methodWithArgs', function(dArgs, args) {
    //method, args... = dArgs;
    var nArgs = [dArgs[0], argDispatcher];
    nArgs.push.apply(nArgs, dArgs.slice(1));
    return this.method.apply(this, nArgs);
  });

  __.method('methodWithSignature', function(dArgs, args) {
    //method, args... = dArgs;
    var nArgs = [dArgs[0], signatureDispatcher];
    nArgs.push.apply(nArgs, dArgs.slice(1));
    return this.method.apply(this, nArgs);
  });

  //TODO bucket bindings here
  //TODO lodash bindings here
  __.methodWithSignature('size', typeof(buckets.Bag), function(b) {
    return b.size()
  });

  exports.__ = __;
  exports.namespace = namespace;
  exports.defaultDispatcher = defaultDispatcher;
  exports.argDispatcher = argDispatcher;
  exports.signatureDispatcher = signatureDispatcher;
});
