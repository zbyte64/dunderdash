"use strict";

describe("withArgs", function () {
  var _ = require("../dunderdash").__;
  var signatureChecker = require("../dunderdash").signatureChecker;
  var immutable = require("immutable");

  describe("signature checker", function() {
    it("type matching", function() {
      var oneString = signatureChecker(_, ["string"]);
      var twoString = signatureChecker(_, ["string", "string"]);
      var stringAndNull = signatureChecker(_, ["string", "null"]);
      expect(oneString([""])).toEqual(true);
      expect(oneString(["", 1])).toEqual(false);
      expect(oneString([1])).toEqual(false);

      expect(twoString(["", ""])).toEqual(true);

      expect(stringAndNull(["", null])).toEqual(true);
      expect(stringAndNull(["", undefined])).toEqual(false);
    });

    it("anonymous type matching", function() {
      var anonAndString = signatureChecker(_, [true, "string"]);

      expect(anonAndString([123, ""])).toEqual(true);
      expect(anonAndString([null, ""])).toEqual(true);
      expect(anonAndString([null, null])).toEqual(false);
      expect(anonAndString([null, "", ""], true)).toEqual(true);
    });
  });

  describe("anonymous get()", function() {
    it("get and getIn on anonymous object", function () {
      var foo = function() {
        this.hello = 'world';
      };

      var bar = new foo();
      expect(_.get(bar, 'hello')).toEqual('world');
      expect(_.getIn(bar, ['hello'])).toEqual('world');
    });
  });

  describe("fib()", function () {
    it("fibonachi works", function () {
      _.methodWithArgs('fib', 0, 0);
      _.methodWithArgs('fib', 1, 1);
      _.methodDefault('fib', function(n) {
        if (n < 2) throw new Error("out of bounds")
        return this.fib(n-1) + this.fib(n-2);
      });

      expect(_.fib(1)).toEqual(1);
      expect(_.fib(2)).toEqual(1);
      expect(_.fib(3)).toEqual(2);
      expect(_.fib(4)).toEqual(3);
      expect(_.fib(5)).toEqual(5);
      expect(_.fib(6)).toEqual(8);
    });
  });

  describe("common bindings", function() {
    it("getters and setters", function() {
      expect(_.getIn(null, ["a"])).toEqual(null);
      expect(_.getIn({a: 1}, ["a"])).toEqual(1);
      expect(_.assocIn({a: 1}, ["b"], 2)).toEqual({a: 1, b: 2});
      expect(_.dissocIn({a: 1, b: 2}, ["a"])).toEqual({b: 2});

      expect(_.updateIn({a: [1]}, ["a"], function(items) {
        expect(items).toEqual([1]);
        return [2, 3];
      })).toEqual({a: [2, 3]});
    });
  });

  describe("lodash bindings", function () {
    it("check bindings", function () {
      expect(_.toArray).toNotEqual(undefined);
    });
    it("getters and setters", function() {
      expect(_.get(null, "a")).toEqual(null);
      expect(_.get(undefined, "a")).toEqual(undefined);
      expect(_.get({}, "a")).toEqual(undefined);
      expect(_.get({a: 1}, "a")).toEqual(1);

      expect(_.set({}, "a", 1)).toEqual({a: 1});
    });
  });

  describe("immutable bindings", function () {
    it("getters and setters", function() {
      var map = new immutable.Map();
      var map1 = _.set(map, "a", 1);
      expect(_.get(map, "a")).toEqual(undefined);
      expect(_.get(map1, "a")).toEqual(1);
      expect(_.getIn(map1, ["a"])).toEqual(1);
      var map2 = _.set(map, "b", new immutable.Vector('a','b','c'));
      expect(_.size(_.get(map2, "b"))).toEqual(3);
      expect(_.getIn(map2, ["b", 2])).toEqual('c');
    });

    it("assocIn", function() {
      var map = new immutable.Map().set("a", new immutable.Vector(1, 2));
      expect(_.assocIn(map, ["a", 2], "foo").toJSON()).toEqual({a: [1,2,"foo"]});
      expect(_.assocIn(map, ["a", "2"], "foo").toJSON()).toEqual({a: [1,2,"foo"]});
    });

    it("deleteIn", function() {
      var map = new immutable.Map().set("a", new immutable.Vector(1, 2));
      expect(_.dissocIn(map, ["a", 1]).toJSON()).toEqual({a: [1]});
    });

    it("filters", function() {
      var v = new immutable.Vector(true, false, 0, 1, 2);
      var r = _.filter(v, function(i) {return !Boolean(i)});
      expect(r.toJSON()).toEqual([ false, 0 ]);

      var r = _.filter(v);
      expect(r.toJSON()).toEqual([ true, 1, 2 ]);
      expect(_.splice(r, 0, 0, 5).toJSON()).toEqual([ 5, true, 1, 2 ]);
    });

    it("map", function() {
      var v = new immutable.Vector(3, 2, 1);
      var r = _.map(v, function(v, k) {return [v, k];});
      expect(r.toJSON()).toEqual([ [3,0], [2,1], [1,2] ]);
    });

    it("slice and splice", function() {
      var v = new immutable.Vector(3, 2, 1, 'a', 'b');
      expect(_.slice(v, 3).toJSON()).toEqual(['a', 'b']);
      expect(_.splice(v, 3, 0, 1, 2, 3).toJSON()).toEqual([3, 2, 1, 1, 2, 3, 'a', 'b']);
    });
  });

});
