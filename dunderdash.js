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


//TODO support the following:
__.method('map'); //simply declare
//and now chain it
__.map.withSignature("object", _.map);
*/

//TODO what is the proper name?
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define(["buckets", "require"], factory);
    } else if (typeof exports === "object") {
        module.exports = factory(require("buckets"), require);
    } else {
        root.dunderdash = factory(root.buckets, function(name) {return root[name];});
    }
}(this, function (buckets, require) {

var dunderdash = {}

function fcall(self, val, args) {
  if (typeof(val) === "function") return {v: val.apply(self, args)};
  return {v: val};
};


function namespace() {
  /* hashing utilities */
  function hide(obj, prop) {
    // Make non iterable if supported
    if (Object.defineProperty) {
      Object.defineProperty(obj, prop, {enumerable:false});
    }
  };

  this.type = function(key) {
    var str = Object.prototype.toString.call(key);
    var type = str.slice(8, -1).toLowerCase();
    // Some browsers yield DOMWindow for null and undefined, works fine on Node
    if (type === 'domwindow' && !key) {
      return key + '';
    }
    return type;
  };

  var uid = 0;

  this.hash = function(key) {
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
          hashes[i] = this.hash(key[i]);
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
  };

  /* state */
  var hash = this.hash.bind(this) //a bit redandunt don't you think javascript?
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

    var checkDispatcher = function(dispatcher) {
      var dispatcherEntries = dispatchRegistry.get(dispatcher);
      if (dispatcherEntries === undefined) return;
      for(var i=0; i<dispatcherEntries.length; i++) {
        var dispatcherArgs = dispatcherEntries[i];
        var f = dispatcher.call(this, dispatcherArgs, args);
        if (f) return f;
      }
    }.bind(this);

    priorities.forEach(function(d) {
      var dispatcher = d.dispatcher;
      seen.add(dispatcher);
      var f = checkDispatcher(dispatcher);
      if (f) {
        retVal = f.v;
        found = true;
        return false;
      }
    });
    if(found) return retVal;

    for (var i=0; i<dispatchers.length; i++) {
      var dispatcher = dispatchers[i];
      if (seen.contains(dispatcher)) continue;
      var f = checkDispatcher(dispatcher);
      if (f) return f.v;
    }

    throw new Error("Could not resolve method signature: "+funcName + "(" + args + ") " + dispatchers);
  };
  this.prioritizeDispatcher = function(dispatcher, priority) {
    //idealy an array ordered by priority
    priorities.add({dispatcher: dispatcher, priority: priority});
  };

  registerMethodHelpers(this);
};

/* dispatchers */
function defaultDispatcher(dispatcherArgs, args) {
  return fcall(this, dispatcherArgs[0], args);
};

function argDispatcher(dispatcherArgs, args) {
  var dArgs = dispatcherArgs.slice(0, dispatcherArgs.length-1);
  if (buckets.arrays.equals(dArgs, args)) {
    return fcall(this, dispatcherArgs[dispatcherArgs.length-1], args);
  }
};

function signatureDispatcher(dispatcherArgs, args) {
  var dArgs = dispatcherArgs.slice(0, dispatcherArgs.length-2);
  var tArgs = args.map(this.type);
  //TODO support anonymous type or regex match or function eval
  if (buckets.arrays.equals(dArgs, tArgs)) {
    return fcall(this, dispatcherArgs[dispatcherArgs.length-1], args);
  }
};

function startSignatureDispatcher(dispatcherArgs, args) {
  var dArgs = dispatcherArgs.slice(0, dispatcherArgs.length-2);
  var tArgs = args.map(this.type).slice(0, dArgs.length);
  if (buckets.arrays.equals(dArgs, tArgs)) {
    return fcall(this, dispatcherArgs[dispatcherArgs.length-1], args);
  }
};


var __ = new namespace();

function registerMethodHelpers(ns) {
  ns.prioritizeDispatcher(defaultDispatcher, 1000);
  ns.prioritizeDispatcher(argDispatcher, 10);
  ns.prioritizeDispatcher(signatureDispatcher, 50);
  ns.prioritizeDispatcher(startSignatureDispatcher, 60);

  function methodHelper(dispatcher) {
    return function(dArgs, args) {
      //method, args... = dArgs;
      var nArgs = [args[0], dispatcher];
      nArgs.push.apply(nArgs, args.slice(1));
      this.method.apply(this, nArgs);
      return {v: null};
    };
  };

  ns.method('methodDefault', methodHelper(defaultDispatcher));

  ns.method('methodWithArgs', methodHelper(argDispatcher));

  ns.method('methodWithSignature', methodHelper(signatureDispatcher));

  ns.method('methodStartsWithSignature', methodHelper(startSignatureDispatcher));
};

function registerSaneStyleBindings(ns) {
  //CONSIDER assoc vs set, dissoc vs unset
  //TODO getIn(path), assocIn(path, value), dissocIn(path), get(key|index), set(key|index), dissoc(key|index)
  var aType = ns.type([]);
  var dType = ns.type({});
  var sType = ns.type("");
  var iType = ns.type(0);
  var nType = ns.type(null);
  var uType = ns.type(undefined);
  //TODO
  var starType = '';

  var getF = function(o, k) {return o[k]};
  ns.methodWithSignature('get', aType, iType, getF);
  ns.methodWithSignature('get', dType, sType, getF);
  ns.methodWithSignature('get', sType, iType, getF);
  ns.methodWithSignature('get', nType, starType, null);
  ns.methodWithSignature('get', uType, starType, undefined);

  var setF = function(o, k, v) {return o[k] = v};
  ns.methodWithSignature('set', aType, iType, starType, setF);
  ns.methodWithSignature('set', dType, sType, starType, setF);
  ns.methodWithSignature('set', sType, iType, starType, setF);
  ns.methodWithSignature('set', nType, starType, starType, null);
  ns.methodWithSignature('set', uType, starType, starType, undefined);

  var dissocF = function(o, k) {return delete o[k]};
  ns.methodWithSignature('delete', aType, iType, dissocF);
  ns.methodWithSignature('delete', dType, sType, dissocF);
  ns.methodWithSignature('delete', sType, iType, dissocF);
  ns.methodWithSignature('delete', nType, starType, null);
  ns.methodWithSignature('delete', uType, starType, undefined);

  var getInF = function(o, path) {
    if (!this.size(path)) return o;
    var c = this.get(o, this.first(path));
    return this.getIn(c, this.rest(path));
  };
  ns.methodWithSignature('getIn', nType, aType, null);
  ns.methodWithSignature('getIn', uType, aType, undefined);
  ns.methodWithSignature('getIn', aType, aType, getInF);
  ns.methodWithSignature('getIn', dType, aType, getInF);
  ns.methodWithSignature('getIn', sType, aType, getInF);

  var assocInF = function(o, path, v) {
    if (this.size(path) === 1) return this.set(o, this.first(path), v);
    var c = this.get(o, this.first(path));
    return this.updateIn(c, this.rest(path), v);
  };
  ns.methodWithSignature('updateIn', nType, aType, starType, null);
  ns.methodWithSignature('updateIn', uType, aType, starType, undefined);
  ns.methodWithSignature('updateIn', aType, aType, starType, assocInF);
  ns.methodWithSignature('updateIn', dType, aType, starType, assocInF);
  ns.methodWithSignature('updateIn', sType, aType, starType, assocInF);

  var dissocInF = function(o, path) {
    if (this.size(path) === 1) return this.dissoc(o, this.first(path));
    var c = this.get(o, this.first(path));
    return this.deleteIn(c, this.rest(path), v);
  };
  ns.methodWithSignature('deleteIn', nType, aType, null);
  ns.methodWithSignature('deleteIn', uType, aType, undefined);
  ns.methodWithSignature('deleteIn', aType, aType, dissocInF);
  ns.methodWithSignature('deleteIn', dType, aType, dissocInF);
  ns.methodWithSignature('deleteIn', sType, aType, dissocInF);

  //TODO overload other "primitive" methods (ie slice, operators, ...)
}

function registerBucketBindings(ns) {
  var buckets = require('bucketsjs');
  if (!buckets) return;
  ns.methodWithSignature('size', ns.type(buckets.Bag), function(b) {
    return b.size()
  });
};

function registerLodashBindings(ns) {
  var ld = require('lodash');
  var aType = ns.type([]);
  var dType = ns.type({});
  var sType = ns.type("");
  var nType = ns.type(null);
  var uType = ns.type(undefined);
  ld.each([
    'compact',
    'difference',
    'rest',
    'findIndex',
    'findLastIndex',
    'first',
    'flatten',
    'indexOf',
    'initial',
    'intersection',
    'last',
    'lastIndexOf',
    'pull',
    'remove',
    'rest',
    'sortedIndex',
    'union',
    'uniq',
    'without',
    'xor',
    'zip',
    'zipObject'
  ], function(mName) {
    ns.methodStartsWithSignature(mName, aType, ld[mName]);
    ns.methodStartsWithSignature(mName, nType, ld[mName]);
    ns.methodStartsWithSignature(mName, uType, ld[mName]);
  });
  ld.each([
    'assign',
    'clone',
    'cloneDeep',
    'defaults',
    'findKey',
    'findLastKey',
    'forIn',
    'forInRight',
    'functions',
    'has',
    'invert',
    'keys',
    'mapValues',
    'merge',
    'omit',
    'pairs',
    'pick',
    'transform',
    'values',
  ], function(mName) {
    ns.methodStartsWithSignature(mName, dType, ld[mName]);
    ns.methodStartsWithSignature(mName, nType, ld[mName]);
    ns.methodStartsWithSignature(mName, uType, ld[mName]);
  });
  ld.each([
    'at',
    'contains',
    'countBy',
    'each',
    'every',
    'filter',
    'find',
    'findLast',
    'forEach',
    'forEachRight',
    'groupBy',
    'indexBy',
    'invoke',
    'map',
    'max',
    'min',
    'pluck',
    'reduce',
    'reduceRight',
    'reject',
    'sample',
    'shuffle',
    'size',
    'some',
    'sortBy',
    'toArray',
    'where'
  ], function(mName) {
    ns.methodStartsWithSignature(mName, aType, ld[mName]);
    ns.methodStartsWithSignature(mName, sType, ld[mName]);
    ns.methodStartsWithSignature(mName, dType, ld[mName]);
    ns.methodStartsWithSignature(mName, nType, ld[mName]);
    ns.methodStartsWithSignature(mName, uType, ld[mName]);
  });

  ld.each(ld.functions(ld), function(f, name) {
    if (!ns.name) ns.methodDefault(name, f);
  });
};

function registerImmutableBindings(ns) {
  var im = require('immutable');
  var mType = ns.type(im.Map());
  var sType = ns.type(im.Sequence());
  var vType = ns.type(im.Vector());
  var oType = ns.type(im.OrderedMap());

  ns.each([
    'map',
    'reduce',
    'set',
    'get',
    'delete',
    'filter',
    'updateIn',
    'getIn',
    'merge',
    'mergeDeep',
    'keys',
    'values'
  ], function(mName) {
    ns.methodStartsWithSignature(mName, mType, im[mName]);
    ns.methodStartsWithSignature(mName, sType, im[mName]);
    ns.methodStartsWithSignature(mName, vType, im[mName]);
    ns.methodStartsWithSignature(mName, oType, im[mName]);
  });
};

//TODO complete data bindings

registerSaneStyleBindings(__);
registerLodashBindings(__);
registerImmutableBindings(__);

dunderdash.__ = __;
dunderdash.fcall = fcall;
dunderdash.namespace = namespace;
dunderdash.defaultDispatcher = defaultDispatcher;
dunderdash.argDispatcher = argDispatcher;
dunderdash.signatureDispatcher = signatureDispatcher;
return dunderdash;
}));
