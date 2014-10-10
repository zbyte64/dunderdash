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
        define(["bucketsjs", "require"], factory);
    } else if (typeof exports === "object") {
        module.exports = factory(require("bucketsjs"), require);
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
    if (type === 'object' && key.constructor) {
      type = key.constructor.name;
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
  var interfaces = {};

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
      dispatchRegistry.set(funcRouter, new funcRouter(this));
    }
    var args = Array.prototype.slice.call(arguments, 2);
    dispatchRegistry.get(funcRouter).push(args);
    return true;
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
      var dispatcherInstance = dispatchRegistry.get(dispatcher);
      if (dispatcherInstance === undefined) return;
      return dispatcherInstance.dispatch(args);
    };

    priorities.forEach(function(d) {
      var dispatcher = d.dispatcher;
      seen.add(dispatcher);
      var f = checkDispatcher(dispatcher);
      if (f) {
        retVal = f.v;
        //console.log("found:", f, funcName, dispatcher)
        found = true;
        return false;
      }
    });
    if(found) return retVal;

    for (var i=0; i<dispatchers.length; i++) {
      var dispatcher = dispatchers[i];
      if (seen.contains(dispatcher)) continue;
      var f = checkDispatcher(dispatcher);
      //if (f) console.log("found:", f, funcName, dispatcher)
      if (f) return f.v;
    }

    throw new Error("Could not resolve method signature: "+funcName + "(" + args + ") ; types: (" + this.map(args, this.type).join(",")+")");
  };
  this.prioritizeDispatcher = function(dispatcher, priority) {
    //idealy an array ordered by priority
    priorities.add({dispatcher: dispatcher, priority: priority});
  };

  //explicit duck typing?!?
  this.ifaceCheck = function(aType, interface) {
    if (!interfaces[aType]) return false;
    return interfaces[aType][interface];
  };
  this.ifaceRegister = function(aType, interface) {
    if (!interfaces[aType]) interfaces[aType] = {};
    interfaces[aType][interface] = true;
  };

  registerMethodHelpers(this);
};

/* dispatchers */
function defaultDispatcher(ns) {
  this.push = function(args) {
    if (args.length !== 1) throw new Error("Default dispatcher takes only one value argument");
    this.val = args[0];
  };
  this.dispatch = function(args) {
    return fcall(ns, this.val, args);
  };
};

function argDispatcher(ns) {
  this.entries = [];
  this.push = function(args) {
    var dArgs = args.slice(0, -1);
    var f = args[args.length-1];
    this.entries.push({a: dArgs, f: f});
  };
  this.dispatch = function(args) {
    var result;
    this.entries.forEach(function(entry) {
      if (buckets.arrays.equals(entry.a, args)) {
        result = fcall(ns, entry.f, args);
        return false;
      }
    });
    return result;
  }
};

function signatureChecker(ns, typeArgs) {
  var tArgs = typeArgs.map(function(arg) {
    var t = ns.type(arg);
    if (t === "string") {
      return function(v) {return arg===ns.type(v);};
    }
    if (t === "function") {
      return arg;
    }
    if (t === "array") {
      //interface check
      return function(v) {
        var match = true;
        var vType = ns.type(v);
        arg.forEach(function(iface) {
          if (!ns.ifaceCheck(vType, iface)) {
            match = false;
            return false;
          }
        });
        return match;
      }
    }
    return function(v) {return arg};
  });

  return function(args, chomp) {
    if (chomp) {
      args = args.slice(0, tArgs.length);
    }
    if (args.length !== tArgs.length) return false;
    return (args.map(function(arg, index) {
      return tArgs[index](arg);
    }).indexOf(false) === -1);
  }
};

function signatureDispatcher(ns) {
  this.entries = [];
  this.push = function(args) {
    var dArgs = args.slice(0, -1);
    var f = args[args.length-1];
    this.entries.push({s: signatureChecker(ns, dArgs), f: f});
  };
  this.dispatch = function(args) {
    var result;
    this.entries.forEach(function(entry) {
      if (entry.s(args)) {
        result = fcall(ns, entry.f, args);
        return false;
      }
    });
    return result;
  }
};

function startSignatureDispatcher(ns) {
  this.entries = [];
  this.push = function(args) {
    var dArgs = args.slice(0, -1);
    var f = args[args.length-1];
    this.entries.push({s: signatureChecker(ns, dArgs), f: f});
  };
  this.dispatch = function(args) {
    var result;
    this.entries.forEach(function(entry) {
      if (entry.s(args, true)) {
        result = fcall(ns, entry.f, args);
        return false;
      }
    });
    return result;
  }
};


var __ = new namespace();

function registerMethodHelpers(ns) {
  ns.prioritizeDispatcher(defaultDispatcher, 1000);
  ns.prioritizeDispatcher(argDispatcher, 10);
  ns.prioritizeDispatcher(signatureDispatcher, 50);
  ns.prioritizeDispatcher(startSignatureDispatcher, 60);

  function methodHelper(dispatcher, iface) {
    return function() {
      //method, args... = dArgs;
      var nArgs = [arguments[0], dispatcher];
      nArgs.push.apply(nArgs, Array.prototype.slice.call(arguments, 1));
      if (nArgs.length !== arguments.length + 1) {
        throw new Error("Could not properly construct helper arguments!");
      }
      if (iface && ns.type(nArgs[2]) === "string") {
        //TODO handle if arg is an array, ie iface def
        ns.ifaceRegister(nArgs[2], nArgs[0]);
      }
      return this.method.apply(this, nArgs);
    };
  };

  ns.method('methodDefault', defaultDispatcher, methodHelper(defaultDispatcher));

  ns.method('methodWithArgs', defaultDispatcher, methodHelper(argDispatcher));

  ns.method('methodWithSignature', defaultDispatcher, methodHelper(signatureDispatcher, true));

  ns.method('methodStartsWithSignature', defaultDispatcher, methodHelper(startSignatureDispatcher, true));
};

function registerSaneStyleBindings(ns) {
  //CONSIDER assoc vs set, dissoc vs unset
  //TODO getIn(path), assocIn(path, value), dissocIn(path), get(key|index), set(key|index), dissoc(key|index)
  /*
    updateIn => updates tail using a function
    assocIn => associates tail with value
  */
  var aType = ns.type([]);
  var dType = ns.type({});
  var sType = ns.type("");
  var iType = ns.type(0);
  var nType = ns.type(null);
  var uType = ns.type(undefined);

  var getF = function(o, k) {return o[k]};
  ns.methodWithSignature('get', aType, iType, getF);
  ns.methodWithSignature('get', dType, sType, getF);
  ns.methodWithSignature('get', sType, iType, getF);
  ns.methodWithSignature('get', nType, true, null);
  ns.methodWithSignature('get', uType, true, undefined);

  var setF = function(o, k, v) {o[k] = v; return o;};
  ns.methodWithSignature('set', aType, iType, true, setF);
  ns.methodWithSignature('set', dType, sType, true, setF);
  ns.methodWithSignature('set', sType, iType, true, setF);
  ns.methodWithSignature('set', nType, true, true, null);
  ns.methodWithSignature('set', uType, true, true, undefined);

  var dissocF = function(o, k) {delete o[k]; return o;};
  ns.methodWithSignature('dissoc', aType, iType, dissocF);
  ns.methodWithSignature('dissoc', dType, sType, dissocF);
  ns.methodWithSignature('dissoc', sType, iType, dissocF);
  ns.methodWithSignature('dissoc', nType, true, null);
  ns.methodWithSignature('dissoc', uType, true, undefined);

  //CONSIDER: <action>In functions should be able to accept generic sequences
  //possibly define a method signature by supported methods:
  //ex: ns.methodWithSignature('getIn', {get: true}, {first: true, rest: true}, getInF);

  var getInF = function(o, path) {
    if (this.size(path) === 0) return o;
    var c = this.get(o, this.first(path));
    if (this.size(path) === 1) return c;
    return this.getIn(c, this.rest(path));
  };
  ns.methodWithSignature('getIn', nType, aType, null);
  ns.methodWithSignature('getIn', uType, aType, undefined);
  ns.methodWithSignature('getIn', ['get'], aType, getInF);

  var assocInF = function(o, path, v) {
    if (this.size(path) === 0) return o;
    var fp = this.first(path);
    if (this.size(path) === 1) return this.set(o, fp, v);
    var c = this.get(o, fp);
    return this.set(o, fp, this.assocIn(c, this.rest(path), v));
  };
  ns.methodWithSignature('assocIn', nType, aType, true, null);
  ns.methodWithSignature('assocIn', uType, aType, true, undefined);
  ns.methodWithSignature('assocIn', ['get', 'set'], aType, true, assocInF);

  var dissocInF = function(o, path) {
    if (this.size(path) === 0) return o;
    var fp = this.first(path);
    if (this.size(path) === 1) return this.dissoc(o, fp);
    var c = this.get(o, fp);
    return this.set(o, fp, this.dissocIn(c, this.rest(path)));
  };
  ns.methodWithSignature('dissocIn', nType, aType, null);
  ns.methodWithSignature('dissocIn', uType, aType, undefined);
  ns.methodWithSignature('dissocIn', ['get', 'set', 'dissoc'], aType, dissocInF);

  //TODO overload other "primitive" methods (ie slice, operators, ...)
  function methodHelper(name) {
    var extraArgs = Array.prototype.slice.call(arguments, 1);
    extraArgs.splice(0, 0, 0, 0); //WHAT? prep for left insertion
    return function() {
      var args = Array.prototype.slice.call(arguments, 1);
      args.splice.apply(args, extraArgs);

      var f = arguments[0][name];
      if (ns.type(f) === "function") return f.apply(arguments[0], args);
      return f;
    };
  };

  ns.methodStartsWithSignature('slice', aType, methodHelper('slice'));
  ns.methodStartsWithSignature('concat', aType, methodHelper('concat'));
  ns.methodStartsWithSignature('splice', aType, methodHelper('splice'));
  ns.methodStartsWithSignature('slice', sType, methodHelper('slice'));
  ns.methodStartsWithSignature('concat', sType, methodHelper('concat'));
  ns.methodStartsWithSignature('splice', sType, methodHelper('splice'));
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

  ld.each(ld.functions(ld), function(name) {
    if (!ns.name) ns.methodDefault(name, ld[name]);
  });
};

function registerImmutableBindings(ns) {
  var im = require('immutable');
  var mType = ns.type(im.Map());
  var sType = ns.type(im.Sequence());
  var isType = "IndexedSequence";
  var vType = ns.type(im.Vector());
  var oType = ns.type(im.OrderedMap());
  var fType = "function";

  function methodHelper(name) {
    var extraArgs = Array.prototype.slice.call(arguments, 1);
    extraArgs.splice(0, 0, 0, 0); //WHAT? prep for left insertion
    return function() {
      var args = Array.prototype.slice.call(arguments, 1);
      args.splice.apply(args, extraArgs);

      var f = arguments[0][name];
      if (ns.type(f) === "function") return f.apply(arguments[0], args);
      return f;
    };
  };

  function spliceF(obj, index, numToRemove, $_) {
    var toAdd = Array.prototype.slice.call(arguments, 3);
    var start = ns.slice(obj, 0, index);
    var end = ns.slice(obj, index+numToRemove);
    return ns.concat(start, toAdd, end);
  };

  function deleteSliceF(obj, index) {
    return ns.splice(obj, index, 1);
  };

  var deleteF = methodHelper('delete');
  ns.methodStartsWithSignature('splice', sType, spliceF);
  ns.methodStartsWithSignature('splice', vType, spliceF);
  ns.methodStartsWithSignature('dissoc', mType, deleteF);
  ns.methodStartsWithSignature('dissoc', sType, deleteSliceF);
  ns.methodStartsWithSignature('dissoc', vType, deleteSliceF);
  ns.methodStartsWithSignature('dissoc', oType, deleteF);

  ns.each([
    'filter'
  ], function(mName) {
    var f = methodHelper(mName);
    var pf = methodHelper(mName, Boolean);
    ns.methodWithSignature(mName, mType, fType, f);
    ns.methodWithSignature(mName, isType, fType, f);
    ns.methodWithSignature(mName, sType, fType, f);
    ns.methodWithSignature(mName, vType, fType, f);
    ns.methodWithSignature(mName, oType, fType, f);
    ns.methodWithSignature(mName, mType, pf);
    ns.methodWithSignature(mName, isType, pf);
    ns.methodWithSignature(mName, sType, pf);
    ns.methodWithSignature(mName, vType, pf);
    ns.methodWithSignature(mName, oType, pf);
  });

  ns.each([
    'map',
    'reduce',
    'set',
    'get',
    'delete',
    'updateIn',
    'merge',
    'mergeDeep',
    'keys',
    'values',
    'toJSON'
  ], function(mName) {
    var f = methodHelper(mName);
    ns.methodStartsWithSignature(mName, mType, f);
    ns.methodStartsWithSignature(mName, isType, f);
    ns.methodStartsWithSignature(mName, sType, f);
    ns.methodStartsWithSignature(mName, vType, f);
    ns.methodStartsWithSignature(mName, oType, f);
  });

  ns.each([
    //array only
    'push',
    'unshift',
    'concat',
    'join',
    'last',
    'first',
    'rest',
    'toArray',
    'slice'
  ], function(mName) {
    var f = methodHelper(mName);
    ns.methodStartsWithSignature(mName, isType, f);
    ns.methodStartsWithSignature(mName, sType, f);
    ns.methodStartsWithSignature(mName, vType, f);
    ns.methodStartsWithSignature(mName, oType, f);
  });

  ns.each([
    ['size', 'length']
  ], function(a) {
    var mName = a[0], imName = a[1];
    var f = methodHelper(imName);
    ns.methodStartsWithSignature(mName, mType, f);
    ns.methodStartsWithSignature(mName, sType, f);
    ns.methodStartsWithSignature(mName, vType, f);
    ns.methodStartsWithSignature(mName, oType, f);
  });
};

//TODO complete data bindings

registerSaneStyleBindings(__);
registerLodashBindings(__);
registerImmutableBindings(__);

dunderdash.__ = __;
dunderdash.fcall = fcall;
dunderdash.namespace = namespace;
dunderdash.signatureChecker = signatureChecker;
dunderdash.defaultDispatcher = defaultDispatcher;
dunderdash.argDispatcher = argDispatcher;
dunderdash.signatureDispatcher = signatureDispatcher;
dunderdash.default = __;
return dunderdash;
}));
