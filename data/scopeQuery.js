"use strict";
var storeUtils_1 = require('./storeUtils');
var isNumber = require('lodash.isnumber');
// This function takes a json blob and a path array, and returns the object at that path in the JSON
// blob.
function scopeJSONToResultPath(_a) {
    var json = _a.json, path = _a.path;
    var current = json;
    path.forEach(function (pathSegment) {
        current = current[pathSegment];
    });
    return current;
}
exports.scopeJSONToResultPath = scopeJSONToResultPath;
// Using the same path format as scopeJSONToResultPath, this applies the same operation to a GraphQL
// query. You get the selection set of the query at the path specified. It also reaches into
// fragments.
function scopeSelectionSetToResultPath(_a) {
    var selectionSet = _a.selectionSet, fragmentMap = _a.fragmentMap, path = _a.path;
    var currSelSet = selectionSet;
    path
        .filter(function (pathSegment) { return !isNumber(pathSegment); })
        .forEach(function (pathSegment) {
        currSelSet = followOnePathSegment(currSelSet, pathSegment, fragmentMap);
    });
    return currSelSet;
}
exports.scopeSelectionSetToResultPath = scopeSelectionSetToResultPath;
// Helper function for scopeSelectionSetToResultPath
function followOnePathSegment(currSelSet, pathSegment, fragmentMap) {
    var matchingFields = getMatchingFields(currSelSet, pathSegment, fragmentMap);
    if (matchingFields.length < 1) {
        throw new Error("No matching field found in query for path segment: " + pathSegment);
    }
    if (matchingFields.length > 1) {
        throw new Error("Multiple fields found in query for path segment \"" + pathSegment + "\". Please file an issue on Apollo Client if you run into this situation.");
    }
    return matchingFields[0].selectionSet;
}
// Helper function for followOnePathSegment
function getMatchingFields(currSelSet, pathSegment, fragmentMap) {
    var matching = [];
    currSelSet.selections.forEach(function (selection) {
        if (storeUtils_1.isField(selection)) {
            if (storeUtils_1.resultKeyNameFromField(selection) === pathSegment) {
                matching.push(selection);
            }
        }
        else if (storeUtils_1.isInlineFragment(selection)) {
            matching = matching.concat(getMatchingFields(selection.selectionSet, pathSegment, fragmentMap));
        }
        else {
            var fragment = fragmentMap[selection.name.value];
            matching = matching.concat(getMatchingFields(fragment.selectionSet, pathSegment, fragmentMap));
        }
    });
    return matching;
}
