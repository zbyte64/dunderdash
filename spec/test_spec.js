"use strict";

describe("withArgs", function () {
  var _ = require("../dunderdash").__;

  describe("fib()", function () {
    it("fibonachi works", function () {
      _.methodWithArgs('fib', 0, 0);
      _.methodWithArgs('fib', 1, 1);
      _.methodDefault('fib', function(n) {
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

  describe("lodash bindings", function () {
    it("check bindings", function () {
      expect(_.toArray).toNotEqual(undefined);
    });
  });
});
