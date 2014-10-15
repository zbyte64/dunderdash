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
    if (!interfaces[interface]) return false;
    if (interfaces[interface].types[aType]) return true;
    var match = false;
    interfaces[interface].checkers.forEach(function(checker) {
      if (checker(aType)) {
        match = true;
        return false;
      }
    });
    return match;
  };
  this.ifaceRegister = function(aType, interface) {
    if (!interfaces[interface]) interfaces[interface] = {types: {}, checkers: []};
    var aTypeType = this.type(aType);
    if (aTypeType === "string") {
      interfaces[interface].types[aType] = true;
    } else if(aTypeType === "function") {
      interfaces[interface].checkers.push(aType);
    } else if(aTypeType === "array") {
      interfaces[interface].checkers.push(function(vType) {
        var match = true;
        aType.forEach(function(iface) {
          if (!this.ifaceCheck(vType, iface)) {
            match = false;
            return false;
          }
        }.bind(this));
        return match;
      }.bind(this));
    } else {
      throw new Error("Unrecognized iface checker:", aType);
    }
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
      return function(v) {return arg===v;};
    }
    if (t === "function") {
      return arg;
    }
    if (t === "array") {
      //interface check
      return function(v) {
        var match = true;
        arg.forEach(function(iface) {
          if (!ns.ifaceCheck(v, iface)) {
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
    var argTypes = args.map(ns.type);
    var match = true;
    argTypes.forEach(function(argT, index) {
      if(!tArgs[index](argT)) {
        match = false;
        return false;
      }
    });
    return match;
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

  function constantlyTrue() {
    return true;
  }

  function registerIface(nArgs) {
    ns.ifaceRegister(nArgs[2], nArgs[0]);
  }

  function registerGIface(nArgs) {
    ns.ifaceRegister(constantlyTrue, nArgs[0]);
  }

  function methodHelper(dispatcher, iface) {
    return function() {
      //method, args... = dArgs;
      var nArgs = [arguments[0], dispatcher];
      nArgs.push.apply(nArgs, Array.prototype.slice.call(arguments, 1));
      if (nArgs.length !== arguments.length + 1) {
        throw new Error("Could not properly construct helper arguments!");
      }
      if (iface) iface(nArgs);
      return this.method.apply(this, nArgs);
    };
  };

  ns.method('methodDefault', defaultDispatcher, methodHelper(defaultDispatcher, registerGIface));

  ns.method('methodWithArgs', defaultDispatcher, methodHelper(argDispatcher));

  ns.method('methodWithSignature', defaultDispatcher, methodHelper(signatureDispatcher, registerIface));

  ns.method('methodStartsWithSignature', defaultDispatcher, methodHelper(startSignatureDispatcher, registerIface));
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
  var fType = "function";
  var seqIface = ['rest', 'first', 'size'];

  var getF = function(o, k) {return o[k]};
  ns.methodWithSignature('get', aType, true, getF);
  ns.methodWithSignature('get', dType, true, getF);
  ns.methodWithSignature('get', sType, true, getF);
  ns.methodWithSignature('get', nType, true, null);
  ns.methodWithSignature('get', uType, true, undefined);
  ns.methodDefault('get', getF);

  var setF = function(o, k, v) {o[k] = v; return o;};
  ns.methodWithSignature('set', aType, true, true, setF);
  ns.methodWithSignature('set', dType, true, true, setF);
  ns.methodWithSignature('set', sType, true, true, setF);
  ns.methodWithSignature('set', nType, true, true, null);
  ns.methodWithSignature('set', uType, true, true, undefined);
  ns.methodDefault('set', setF);

  var dissocF = function(o, k) {delete o[k]; return o;};
  ns.methodWithSignature('dissoc', aType, true, dissocF);
  ns.methodWithSignature('dissoc', dType, true, dissocF);
  ns.methodWithSignature('dissoc', sType, true, dissocF);
  ns.methodWithSignature('dissoc', nType, true, null);
  ns.methodWithSignature('dissoc', uType, true, undefined);
  ns.methodDefault('dissoc', dissocF);

  //CONSIDER: <action>In functions should be able to accept generic sequences
  //possibly define a method signature by supported methods:
  //ex: ns.methodWithSignature('getIn', {get: true}, {first: true, rest: true}, getInF);

  var getInF = function(o, path) {
    if (this.size(path) === 0) return o;
    var c = this.get(o, this.first(path));
    if (this.size(path) === 1) return c;
    return this.getIn(c, this.rest(path));
  };
  ns.methodWithSignature('getIn', nType, seqIface, null);
  ns.methodWithSignature('getIn', uType, seqIface, undefined);
  ns.methodWithSignature('getIn', ['get'], seqIface, getInF);

  var updateInF = function(o, path, v) {
    if (this.size(path) === 0) return o;
    var fp = this.first(path);
    if (this.size(path) === 1) {
      return this.set(o, fp, v(this.get(o, fp)));
    }
    var c = this.get(o, fp);
    return this.set(o, fp, this.updateIn(c, this.rest(path), v));
  };
  ns.methodWithSignature('updateIn', nType, seqIface, fType, null);
  ns.methodWithSignature('updateIn', uType, seqIface, fType, undefined);
  ns.methodWithSignature('updateIn', ['get', 'set'], seqIface, fType, updateInF);

  var assocInF = function(o, path, v) {
    if (this.size(path) === 0) return o;
    var fp = this.first(path);
    if (this.size(path) === 1) return this.set(o, fp, v);
    var c = this.get(o, fp);
    return this.set(o, fp, this.assocIn(c, this.rest(path), v));
  };
  ns.methodWithSignature('assocIn', nType, seqIface, true, null);
  ns.methodWithSignature('assocIn', uType, seqIface, true, undefined);
  ns.methodWithSignature('assocIn', ['get', 'set'], seqIface, true, assocInF);

  var dissocInF = function(o, path) {
    if (this.size(path) === 0) return o;
    var fp = this.first(path);
    if (this.size(path) === 1) return this.dissoc(o, fp);
    var c = this.get(o, fp);
    return this.set(o, fp, this.dissocIn(c, this.rest(path)));
  };
  ns.methodWithSignature('dissocIn', nType, seqIface, null);
  ns.methodWithSignature('dissocIn', uType, seqIface, undefined);
  ns.methodWithSignature('dissocIn', ['get', 'set', 'dissoc'], seqIface, dissocInF);

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
  var sTypes = function(vType) {
    return vType.slice(-8) === "Sequence";
  };
  var vType = ns.type(im.Vector());
  var oType = ns.type(im.OrderedMap());
  var fType = "function";
  var strType = ns.type("");
  var intType = ns.type(0);

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
  ns.methodStartsWithSignature('splice', sTypes, spliceF);
  ns.methodStartsWithSignature('splice', vType, spliceF);
  ns.methodStartsWithSignature('dissoc', mType, deleteF);
  ns.methodStartsWithSignature('dissoc', sTypes, deleteSliceF);
  ns.methodStartsWithSignature('dissoc', vType, deleteSliceF);
  ns.methodStartsWithSignature('dissoc', oType, deleteF);

  function sanitizeAGet(obj, index) {
    return ns.get(obj, parseInt(index));
  }

  function sanitizeASet(obj, index, val) {
    return ns.set(obj, parseInt(index), val);
  }

  ns.methodWithSignature('get', sTypes, strType, sanitizeAGet);
  ns.methodWithSignature('get', vType, strType, sanitizeAGet);
  ns.methodWithSignature('set', sTypes, strType, true, sanitizeASet);
  ns.methodWithSignature('set', vType, strType, true, sanitizeASet);

  var getF = methodHelper('get');
  var setF = methodHelper('set');
  ns.methodWithSignature('get', mType, true, getF);
  ns.methodWithSignature('get', sTypes, intType, getF);
  ns.methodWithSignature('get', vType, intType, getF);
  ns.methodWithSignature('get', oType, true, getF);
  ns.methodWithSignature('set', mType, true, true, setF);
  ns.methodWithSignature('set', sTypes, intType, true, function(obj, index, val) {
    return ns.splice(obj, index, 1, val);
  });
  ns.methodWithSignature('set', vType, intType, true, setF);
  ns.methodWithSignature('set', oType, true, true, setF);

  ns.each([
    'filter'
  ], function(mName) {
    var f = methodHelper(mName);
    var pf = methodHelper(mName, Boolean);
    ns.methodWithSignature(mName, mType, fType, f);
    ns.methodWithSignature(mName, sTypes, fType, f);
    ns.methodWithSignature(mName, vType, fType, f);
    ns.methodWithSignature(mName, oType, fType, f);
    ns.methodWithSignature(mName, mType, pf);
    ns.methodWithSignature(mName, sTypes, pf);
    ns.methodWithSignature(mName, vType, pf);
    ns.methodWithSignature(mName, oType, pf);
  });

  ns.each([
    'map',
    'every',
    'reduce',
    'keys',
    'values',
    'toJSON'
  ], function(mName) {
    var f = methodHelper(mName);
    ns.methodStartsWithSignature(mName, mType, f);
    ns.methodStartsWithSignature(mName, sTypes, f);
    ns.methodStartsWithSignature(mName, vType, f);
    ns.methodStartsWithSignature(mName, oType, f);
  });

  ns.each([
    'delete',
    'merge',
    'mergeDeep',
  ], function(mName) {
    var f = methodHelper(mName);
    ns.methodStartsWithSignature(mName, mType, f);
    ns.methodStartsWithSignature(mName, vType, f);
    ns.methodStartsWithSignature(mName, oType, f);
  });

  ns.each([
    //double linked methods
    'push',
    'unshift',
  ], function(mName) {
    var f = methodHelper(mName);
    ns.methodStartsWithSignature(mName, vType, f);
    ns.methodStartsWithSignature(mName, oType, f);
  });

  ns.each([
    'concat',
    'join',
    'last',
    'first',
    'rest',
    'toArray',
    'slice',
    'find',
    'forEach',
    'reverse',
    'sort',
    'flatten',
    'groupBy',
    'has',
    'contains'
  ], function(mName) {
    var f = methodHelper(mName);
    ns.methodStartsWithSignature(mName, sTypes, f);
    ns.methodStartsWithSignature(mName, vType, f);
    ns.methodStartsWithSignature(mName, oType, f);
  });

  ns.each([
    ['size', 'length'],
    ['each', 'forEach'],
    ['isEqual', 'equals']
  ], function(a) {
    var mName = a[0], imName = a[1];
    var f = methodHelper(imName);
    ns.methodStartsWithSignature(mName, mType, f);
    ns.methodStartsWithSignature(mName, sTypes, f);
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
