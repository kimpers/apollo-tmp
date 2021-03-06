"use strict";
var diffAgainstStore_1 = require('./diffAgainstStore');
var getFromAST_1 = require('../queries/getFromAST');
// import {
//   printAST,
// } from './debug';
function readQueryFromStore(_a) {
    var store = _a.store, query = _a.query, variables = _a.variables, returnPartialData = _a.returnPartialData, fragmentMap = _a.fragmentMap;
    var queryDef = getFromAST_1.getQueryDefinition(query);
    return readSelectionSetFromStore({
        store: store,
        rootId: 'ROOT_QUERY',
        selectionSet: queryDef.selectionSet,
        variables: variables,
        returnPartialData: returnPartialData,
        fragmentMap: fragmentMap
    });
}
exports.readQueryFromStore = readQueryFromStore;
function readFragmentFromStore(_a) {
    var store = _a.store, fragment = _a.fragment, rootId = _a.rootId, variables = _a.variables, returnPartialData = _a.returnPartialData;
    var fragmentDef = getFromAST_1.getFragmentDefinition(fragment);
    return readSelectionSetFromStore({
        store: store,
        rootId: rootId,
        selectionSet: fragmentDef.selectionSet,
        variables: variables,
        returnPartialData: returnPartialData
    });
}
exports.readFragmentFromStore = readFragmentFromStore;
function readSelectionSetFromStore(_a) {
    var store = _a.store, rootId = _a.rootId, selectionSet = _a.selectionSet, variables = _a.variables, _b = _a.returnPartialData, returnPartialData = _b === void 0 ? false : _b, fragmentMap = _a.fragmentMap;
    var result = diffAgainstStore_1.diffSelectionSetAgainstStore({
        selectionSet: selectionSet,
        rootId: rootId,
        store: store,
        throwOnMissingField: !returnPartialData,
        variables: variables,
        fragmentMap: fragmentMap
    }).result;
    return result;
}
exports.readSelectionSetFromStore = readSelectionSetFromStore;
