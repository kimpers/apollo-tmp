"use strict";
var mapValues = require('lodash.mapvalues');
var isArray = require('lodash.isarray');
var cloneDeep = require('lodash.clonedeep');
var assign = require('lodash.assign');
var replaceQueryResults_1 = require('./replaceQueryResults');
var writeToStore_1 = require('./writeToStore');
var scopeQuery_1 = require('./scopeQuery');
// Reducer for ARRAY_INSERT behavior
function mutationResultArrayInsertReducer(state, _a) {
    var behavior = _a.behavior, result = _a.result, variables = _a.variables, fragmentMap = _a.fragmentMap, selectionSet = _a.selectionSet, config = _a.config;
    var _b = behavior, resultPath = _b.resultPath, storePath = _b.storePath, where = _b.where;
    // Step 1: get selection set and result for resultPath
    var scopedSelectionSet = scopeQuery_1.scopeSelectionSetToResultPath({
        selectionSet: selectionSet,
        fragmentMap: fragmentMap,
        path: resultPath
    });
    var scopedResult = scopeQuery_1.scopeJSONToResultPath({
        json: result.data,
        path: resultPath
    });
    // OK, now we need to get a dataID to pass to writeSelectionSetToStore
    var dataId = config.dataIdFromObject(scopedResult) || generateMutationResultDataId();
    // Step 2: insert object into store with writeSelectionSet
    state = writeToStore_1.writeSelectionSetToStore({
        result: scopedResult,
        dataId: dataId,
        selectionSet: scopedSelectionSet,
        store: state,
        variables: variables,
        dataIdFromObject: config.dataIdFromObject,
        fragmentMap: fragmentMap
    });
    // Step 3: insert dataId reference into storePath array
    var dataIdOfObj = storePath[0], restStorePath = storePath.slice(1);
    var clonedObj = cloneDeep(state[dataIdOfObj]);
    var array = scopeQuery_1.scopeJSONToResultPath({
        json: clonedObj,
        path: restStorePath
    });
    if (where === 'PREPEND') {
        array.unshift(dataId);
    }
    else if (where === 'APPEND') {
        array.push(dataId);
    }
    else {
        throw new Error('Unsupported "where" option to ARRAY_INSERT.');
    }
    return assign(state, (_c = {},
        _c[dataIdOfObj] = clonedObj,
        _c
    ));
    var _c;
}
// Helper for ARRAY_INSERT.
// When writing query results to the store, we generate IDs based on their path in the query. Here,
// we don't have access to such uniquely identifying information, so the best we can do is a
// sequential ID.
var currId = 0;
function generateMutationResultDataId() {
    currId++;
    return "ARRAY_INSERT-gen-id-" + currId;
}
// Reducer for 'DELETE' behavior
function mutationResultDeleteReducer(state, _a) {
    var behavior = _a.behavior;
    var dataId = behavior.dataId;
    // Delete the object
    delete state[dataId];
    // Now we need to go through the whole store and remove all references
    var newState = mapValues(state, function (storeObj) {
        return removeRefsFromStoreObj(storeObj, dataId);
    });
    return newState;
}
function removeRefsFromStoreObj(storeObj, dataId) {
    var affected = false;
    var cleanedObj = mapValues(storeObj, function (value, key) {
        if (value === dataId) {
            affected = true;
            return null;
        }
        if (isArray(value)) {
            var filteredArray = cleanArray(value, dataId);
            if (filteredArray !== value) {
                affected = true;
                return filteredArray;
            }
        }
        // If not modified, return the original value
        return value;
    });
    if (affected) {
        // Maintain === for unchanged objects
        return cleanedObj;
    }
    else {
        return storeObj;
    }
}
// Remove any occurrences of dataId in an arbitrarily nested array, and make sure that the old array
// === the new array if nothing was changed
function cleanArray(originalArray, dataId) {
    if (originalArray.length && isArray(originalArray[0])) {
        // Handle arbitrarily nested arrays
        var modified_1 = false;
        var filteredArray = originalArray.map(function (nestedArray) {
            var nestedFilteredArray = cleanArray(nestedArray, dataId);
            if (nestedFilteredArray !== nestedArray) {
                modified_1 = true;
                return nestedFilteredArray;
            }
            return nestedArray;
        });
        if (!modified_1) {
            return originalArray;
        }
        return filteredArray;
    }
    else {
        var filteredArray = originalArray.filter(function (item) { return item !== dataId; });
        if (filteredArray.length === originalArray.length) {
            // No items were removed, return original array
            return originalArray;
        }
        return filteredArray;
    }
}
exports.cleanArray = cleanArray;
// Reducer for 'ARRAY_DELETE' behavior
function mutationResultArrayDeleteReducer(state, _a) {
    var behavior = _a.behavior;
    var _b = behavior, dataId = _b.dataId, storePath = _b.storePath;
    var dataIdOfObj = storePath[0], restStorePath = storePath.slice(1);
    var clonedObj = cloneDeep(state[dataIdOfObj]);
    var array = scopeQuery_1.scopeJSONToResultPath({
        json: clonedObj,
        path: restStorePath
    });
    array.splice(array.indexOf(dataId), 1);
    return assign(state, (_c = {},
        _c[dataIdOfObj] = clonedObj,
        _c
    ));
    var _c;
}
function mutationResultQueryResultReducer(state, _a) {
    var behavior = _a.behavior, config = _a.config;
    return replaceQueryResults_1.replaceQueryResults(state, behavior, config);
}
exports.mutationResultQueryResultReducer = mutationResultQueryResultReducer;
// Combines all of the default reducers into a map based on the behavior type they accept
// The behavior type is used to pick the right reducer when evaluating the result of the mutation
exports.defaultMutationBehaviorReducers = {
    'ARRAY_INSERT': mutationResultArrayInsertReducer,
    'DELETE': mutationResultDeleteReducer,
    'ARRAY_DELETE': mutationResultArrayDeleteReducer,
    'QUERY_RESULT': mutationResultQueryResultReducer
};
