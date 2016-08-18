"use strict";
// For development only!
var isArray = require('lodash.isarray');
var isObject = require('lodash.isobject');
var omit = require('lodash.omit');
var mapValues = require('lodash.mapvalues');
function stripLoc(obj) {
    if (isArray(obj)) {
        return obj.map(stripLoc);
    }
    if (!isObject(obj)) {
        return obj;
    }
    var omitted = omit(obj, ['loc']);
    return mapValues(omitted, function (value) {
        return stripLoc(value);
    });
}
exports.stripLoc = stripLoc;
function printAST(fragAst) {
    /* tslint:disable */
    console.log(JSON.stringify(stripLoc(fragAst), null, 2));
}
exports.printAST = printAST;
