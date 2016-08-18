"use strict";
var isArray = require('lodash.isarray');
var isNull = require('lodash.isnull');
var isUndefined = require('lodash.isundefined');
var isObject = require('lodash.isobject');
var assign = require('lodash.assign');
var getFromAST_1 = require('../queries/getFromAST');
var storeUtils_1 = require('./storeUtils');
var store_1 = require('./store');
var diffAgainstStore_1 = require('./diffAgainstStore');
var directives_1 = require('../queries/directives');
var errors_1 = require('../errors');
// import {
//   printAST,
// } from './debug';
/**
 * Convert a nested GraphQL result into a normalized store, where each object from the schema
 * appears exactly once.
 * @param  {Object} result Arbitrary nested JSON, returned from the GraphQL server
 * @param  {String} [fragment] The GraphQL fragment used to fetch the data in result
 * @param  {SelectionSet} [selectionSet] The parsed selection set for the subtree of the query this
 *                                       result represents
 * @param  {Object} [store] The store to merge into
 * @return {Object} The resulting store
 */
function writeFragmentToStore(_a) {
    var result = _a.result, fragment = _a.fragment, _b = _a.store, store = _b === void 0 ? {} : _b, variables = _a.variables, _c = _a.dataIdFromObject, dataIdFromObject = _c === void 0 ? null : _c;
    // Argument validation
    if (!fragment) {
        throw new Error('Must pass fragment.');
    }
    var parsedFragment = getFromAST_1.getFragmentDefinition(fragment);
    var selectionSet = parsedFragment.selectionSet;
    if (!result['id']) {
        throw new Error('Result must have id when writing fragment to store.');
    }
    return writeSelectionSetToStore({
        dataId: result['id'],
        result: result,
        selectionSet: selectionSet,
        store: store,
        variables: variables,
        dataIdFromObject: dataIdFromObject
    });
}
exports.writeFragmentToStore = writeFragmentToStore;
function writeQueryToStore(_a) {
    var result = _a.result, query = _a.query, _b = _a.store, store = _b === void 0 ? {} : _b, variables = _a.variables, _c = _a.dataIdFromObject, dataIdFromObject = _c === void 0 ? null : _c, fragmentMap = _a.fragmentMap;
    var queryDefinition = getFromAST_1.getQueryDefinition(query);
    return writeSelectionSetToStore({
        dataId: 'ROOT_QUERY',
        result: result,
        selectionSet: queryDefinition.selectionSet,
        store: store,
        variables: variables,
        dataIdFromObject: dataIdFromObject,
        fragmentMap: fragmentMap
    });
}
exports.writeQueryToStore = writeQueryToStore;
function writeSelectionSetToStore(_a) {
    var result = _a.result, dataId = _a.dataId, selectionSet = _a.selectionSet, _b = _a.store, store = _b === void 0 ? {} : _b, variables = _a.variables, dataIdFromObject = _a.dataIdFromObject, fragmentMap = _a.fragmentMap;
    if (!fragmentMap) {
        //we have an empty sym table if there's no sym table given
        //to us for the fragments.
        fragmentMap = {};
    }
    var fragmentErrors = {};
    selectionSet.selections.forEach(function (selection) {
        var included = directives_1.shouldInclude(selection, variables);
        if (storeUtils_1.isField(selection)) {
            var resultFieldKey = storeUtils_1.resultKeyNameFromField(selection);
            var value = result[resultFieldKey];
            // In both of these cases, we add some extra information to the error
            // that allows us to use fragmentErrors correctly. Since the ApolloError type
            // derives from the Javascript Error type, the end-user doesn't notice the
            // fact that we're doing this.
            if (isUndefined(value) && included) {
                throw new errors_1.ApolloError({
                    errorMessage: "Can't find field " + resultFieldKey + " on result object " + dataId + ".",
                    extraInfo: {
                        isFieldError: true
                    }
                });
            }
            if (!isUndefined(value) && !included) {
                throw new errors_1.ApolloError({
                    errorMessage: "Found extra field " + resultFieldKey + " on result object " + dataId + ".",
                    extraInfo: {
                        isFieldError: true
                    }
                });
            }
            if (!isUndefined(value)) {
                writeFieldToStore({
                    dataId: dataId,
                    value: value,
                    variables: variables,
                    store: store,
                    field: selection,
                    dataIdFromObject: dataIdFromObject,
                    fragmentMap: fragmentMap
                });
            }
        }
        else if (storeUtils_1.isInlineFragment(selection)) {
            var typename = selection.typeCondition.name.value;
            if (included) {
                try {
                    // XXX what to do if this tries to write the same fields? Also, type conditions...
                    writeSelectionSetToStore({
                        result: result,
                        selectionSet: selection.selectionSet,
                        store: store,
                        variables: variables,
                        dataId: dataId,
                        dataIdFromObject: dataIdFromObject,
                        fragmentMap: fragmentMap
                    });
                    if (!fragmentErrors[typename]) {
                        fragmentErrors[typename] = null;
                    }
                }
                catch (e) {
                    if (e.extraInfo && e.extraInfo.isFieldError) {
                        fragmentErrors[typename] = e;
                    }
                    else {
                        throw e;
                    }
                }
            }
        }
        else {
            //look up the fragment referred to in the selection
            var fragment = fragmentMap[selection.name.value];
            if (!fragment) {
                throw new Error("No fragment named " + selection.name.value + ".");
            }
            var typename = fragment.typeCondition.name.value;
            if (included) {
                try {
                    writeSelectionSetToStore({
                        result: result,
                        selectionSet: fragment.selectionSet,
                        store: store,
                        variables: variables,
                        dataId: dataId,
                        dataIdFromObject: dataIdFromObject,
                        fragmentMap: fragmentMap
                    });
                    if (!fragmentErrors[typename]) {
                        fragmentErrors[typename] = null;
                    }
                }
                catch (e) {
                    if (e.extraInfo && e.extraInfo.isFieldError) {
                        fragmentErrors[typename] = e;
                    }
                    else {
                        throw e;
                    }
                }
            }
        }
    });
    diffAgainstStore_1.handleFragmentErrors(fragmentErrors);
    return store;
}
exports.writeSelectionSetToStore = writeSelectionSetToStore;
// Checks if the id given is an id that was generated by Apollo
// rather than by dataIdFromObject.
function isGeneratedId(id) {
    return (id[0] === '$');
}
function mergeWithGenerated(generatedKey, realKey, cache) {
    var generated = cache[generatedKey];
    var real = cache[realKey];
    Object.keys(generated).forEach(function (key) {
        var value = generated[key];
        var realValue = real[key];
        if (store_1.isIdValue(value)
            && isGeneratedId(value.id)
            && store_1.isIdValue(realValue)) {
            mergeWithGenerated(value.id, realValue.id, cache);
        }
        delete cache[generatedKey];
        cache[realKey] = assign({}, generated, real);
    });
}
function writeFieldToStore(_a) {
    var field = _a.field, value = _a.value, variables = _a.variables, store = _a.store, dataId = _a.dataId, dataIdFromObject = _a.dataIdFromObject, fragmentMap = _a.fragmentMap;
    var storeValue;
    var storeFieldName = storeUtils_1.storeKeyNameFromField(field, variables);
    // specifies if we need to merge existing keys in the store
    var shouldMerge = false;
    // If we merge, this will be the generatedKey
    var generatedKey;
    // If it's a scalar that's not a JSON blob, just store it in the store
    if ((!field.selectionSet || isNull(value)) && !isObject(value)) {
        storeValue = value;
    }
    else if ((!field.selectionSet || isNull(value)) && isObject(value)) {
        // If it is a scalar that's a JSON blob, we have to "escape" it so it can't
        // pretend to be an id
        storeValue = {
            type: 'json',
            json: value
        };
    }
    else if (isArray(value)) {
        // this is an array with sub-objects
        var thisIdList_1 = [];
        value.forEach(function (item, index) {
            if (isNull(item)) {
                thisIdList_1.push(null);
            }
            else {
                var itemDataId = dataId + "." + storeFieldName + "." + index;
                if (dataIdFromObject) {
                    var semanticId = dataIdFromObject(item);
                    if (semanticId) {
                        itemDataId = semanticId;
                    }
                }
                thisIdList_1.push(itemDataId);
                writeSelectionSetToStore({
                    dataId: itemDataId,
                    result: item,
                    store: store,
                    selectionSet: field.selectionSet,
                    variables: variables,
                    dataIdFromObject: dataIdFromObject,
                    fragmentMap: fragmentMap
                });
            }
        });
        storeValue = thisIdList_1;
    }
    else {
        // It's an object
        var valueDataId = dataId + "." + storeFieldName;
        var generated = true;
        // We only prepend the '$' if the valueDataId isn't already a generated
        // id.
        if (!isGeneratedId(valueDataId)) {
            valueDataId = '$' + valueDataId;
        }
        if (dataIdFromObject) {
            var semanticId = dataIdFromObject(value);
            // We throw an error if the first character of the id is '$. This is
            // because we use that character to designate an Apollo-generated id
            // and we use the distinction between user-desiginated and application-provided
            // ids when managing overwrites.
            if (semanticId && isGeneratedId(semanticId)) {
                throw new Error('IDs returned by dataIdFromObject cannot begin with the "$" character.');
            }
            if (semanticId) {
                valueDataId = semanticId;
                generated = false;
            }
        }
        writeSelectionSetToStore({
            dataId: valueDataId,
            result: value,
            store: store,
            selectionSet: field.selectionSet,
            variables: variables,
            dataIdFromObject: dataIdFromObject,
            fragmentMap: fragmentMap
        });
        // We take the id and escape it (i.e. wrap it with an enclosing object).
        // This allows us to distinguish IDs from normal scalars.
        storeValue = {
            type: 'id',
            id: valueDataId,
            generated: generated
        };
        // check if there was a generated id at the location where we're
        // about to place this new id. If there was, we have to merge the
        // data from that id with the data we're about to write in the store.
        if (store[dataId] && store[dataId][storeFieldName] !== storeValue) {
            var escapedId = store[dataId][storeFieldName];
            // If there is already a real id in the store and the current id we
            // are dealing with is generated, we throw an error.
            if (store_1.isIdValue(storeValue) && storeValue.generated
                && store_1.isIdValue(escapedId) && !escapedId.generated) {
                throw new errors_1.ApolloError({
                    errorMessage: "Store error: the application attempted to write an object with no provided id" +
                        (" but the store already contains an id of " + escapedId.id + " for this object.")
                });
            }
            if (store_1.isIdValue(escapedId) && escapedId.generated) {
                generatedKey = escapedId.id;
                shouldMerge = true;
            }
        }
    }
    var newStoreObj = assign({}, store[dataId], (_b = {},
        _b[storeFieldName] = storeValue,
        _b
    ));
    if (shouldMerge) {
        mergeWithGenerated(generatedKey, storeValue.id, store);
    }
    if (!store[dataId] || storeValue !== store[dataId][storeFieldName]) {
        store[dataId] = newStoreObj;
    }
    var _b;
}
