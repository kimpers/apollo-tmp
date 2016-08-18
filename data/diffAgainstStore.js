"use strict";
var isArray = require('lodash.isarray');
var isNull = require('lodash.isnull');
var has = require('lodash.has');
var assign = require('lodash.assign');
var storeUtils_1 = require('./storeUtils');
var store_1 = require('./store');
var getFromAST_1 = require('../queries/getFromAST');
var directives_1 = require('../queries/directives');
var errors_1 = require('../errors');
function diffQueryAgainstStore(_a) {
    var store = _a.store, query = _a.query, variables = _a.variables;
    var queryDef = getFromAST_1.getQueryDefinition(query);
    return diffSelectionSetAgainstStore({
        store: store,
        rootId: 'ROOT_QUERY',
        selectionSet: queryDef.selectionSet,
        throwOnMissingField: false,
        variables: variables
    });
}
exports.diffQueryAgainstStore = diffQueryAgainstStore;
function diffFragmentAgainstStore(_a) {
    var store = _a.store, fragment = _a.fragment, rootId = _a.rootId, variables = _a.variables;
    var fragmentDef = getFromAST_1.getFragmentDefinition(fragment);
    return diffSelectionSetAgainstStore({
        store: store,
        rootId: rootId,
        selectionSet: fragmentDef.selectionSet,
        throwOnMissingField: false,
        variables: variables
    });
}
exports.diffFragmentAgainstStore = diffFragmentAgainstStore;
// Takes a map of errors for fragments of each type. If all of the types have
// thrown an error, this function will throw the error associated with one
// of the types.
function handleFragmentErrors(fragmentErrors) {
    var typenames = Object.keys(fragmentErrors);
    // This is a no-op.
    if (typenames.length === 0) {
        return;
    }
    var errorTypes = typenames.filter(function (typename) {
        return (fragmentErrors[typename] !== null);
    });
    if (errorTypes.length === Object.keys(fragmentErrors).length) {
        throw fragmentErrors[errorTypes[0]];
    }
}
exports.handleFragmentErrors = handleFragmentErrors;
/**
 * Given a store, a root ID, and a selection set, return as much of the result as possible and
 * identify which selection sets and root IDs need to be fetched to get the rest of the requested
 * data.
 * @param  {SelectionSet} selectionSet A GraphQL selection set
 * @param  {Store} store The Apollo Client store object
 * @param  {String} rootId The ID of the root object that the selection set applies to
 * @param  {Boolean} [throwOnMissingField] Throw an error rather than returning any selection sets
 * when a field isn't found in the store.
 * @return {result: Object, missingSelectionSets: [SelectionSet]}
 */
function diffSelectionSetAgainstStore(_a) {
    var selectionSet = _a.selectionSet, store = _a.store, rootId = _a.rootId, _b = _a.throwOnMissingField, throwOnMissingField = _b === void 0 ? false : _b, variables = _a.variables, fragmentMap = _a.fragmentMap;
    if (selectionSet.kind !== 'SelectionSet') {
        throw new Error('Must be a selection set.');
    }
    if (!fragmentMap) {
        fragmentMap = {};
    }
    var result = {};
    var missingFields = [];
    // A map going from a typename to missing field errors thrown on that
    // typename. This data structure is needed to support union types. For example, if we have
    // a union type (Apple | Orange) and we only receive fields for fragments on
    // "Apple", that should not result in an error. But, if at least one of the fragments
    // for each of "Apple" and "Orange" is missing a field, that should return an error.
    // (i.e. with this approach, we manage to handle missing fields correctly even for
    // union types without any knowledge of the GraphQL schema).
    var fragmentErrors = {};
    selectionSet.selections.forEach(function (selection) {
        // Don't push more than one missing field per field in the query
        var missingFieldPushed = false;
        var fieldResult;
        var fieldIsMissing;
        function pushMissingField(missingField) {
            if (!missingFieldPushed) {
                missingFields.push(missingField);
                missingFieldPushed = true;
            }
        }
        var included = directives_1.shouldInclude(selection, variables);
        if (storeUtils_1.isField(selection)) {
            var diffResult = diffFieldAgainstStore({
                field: selection,
                throwOnMissingField: throwOnMissingField,
                variables: variables,
                rootId: rootId,
                store: store,
                fragmentMap: fragmentMap,
                included: included
            });
            fieldIsMissing = diffResult.isMissing;
            fieldResult = diffResult.result;
            var resultFieldKey = storeUtils_1.resultKeyNameFromField(selection);
            if (fieldIsMissing) {
                // even if the field is not included, we want to keep it in the
                // query that is sent to the server. So, we push it into the set of
                // fields that is missing.
                pushMissingField(selection);
            }
            if (included && fieldResult !== undefined) {
                result[resultFieldKey] = fieldResult;
            }
        }
        else if (storeUtils_1.isInlineFragment(selection)) {
            var typename = selection.typeCondition.name.value;
            if (included) {
                try {
                    var diffResult = diffSelectionSetAgainstStore({
                        selectionSet: selection.selectionSet,
                        throwOnMissingField: throwOnMissingField,
                        variables: variables,
                        rootId: rootId,
                        store: store,
                        fragmentMap: fragmentMap
                    });
                    fieldIsMissing = diffResult.isMissing;
                    fieldResult = diffResult.result;
                    if (fieldIsMissing) {
                        pushMissingField(selection);
                    }
                    else {
                        assign(result, fieldResult);
                    }
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
            var fragment = fragmentMap[selection.name.value];
            if (!fragment) {
                throw new Error("No fragment named " + selection.name.value);
            }
            var typename = fragment.typeCondition.name.value;
            if (included) {
                try {
                    var diffResult = diffSelectionSetAgainstStore({
                        selectionSet: fragment.selectionSet,
                        throwOnMissingField: throwOnMissingField,
                        variables: variables,
                        rootId: rootId,
                        store: store,
                        fragmentMap: fragmentMap
                    });
                    fieldIsMissing = diffResult.isMissing;
                    fieldResult = diffResult.result;
                    if (fieldIsMissing) {
                        pushMissingField(selection);
                    }
                    else {
                        assign(result, fieldResult);
                    }
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
    if (throwOnMissingField) {
        handleFragmentErrors(fragmentErrors);
    }
    // Set this to true if we don't have enough information at this level to generate a refetch
    // query, so we need to merge the selection set with the parent, rather than appending
    var isMissing;
    var missingSelectionSets;
    // If we weren't able to resolve some selections from the store, construct them into
    // a query we can fetch from the server
    if (missingFields.length) {
        if (rootId === 'ROOT_QUERY') {
            var typeName = 'Query';
            missingSelectionSets = [
                {
                    id: rootId,
                    typeName: typeName,
                    selectionSet: {
                        kind: 'SelectionSet',
                        selections: missingFields
                    }
                },
            ];
        }
        else {
            isMissing = 'true';
        }
    }
    return {
        result: result,
        isMissing: isMissing,
        missingSelectionSets: missingSelectionSets
    };
}
exports.diffSelectionSetAgainstStore = diffSelectionSetAgainstStore;
function diffFieldAgainstStore(_a) {
    var field = _a.field, throwOnMissingField = _a.throwOnMissingField, variables = _a.variables, rootId = _a.rootId, store = _a.store, fragmentMap = _a.fragmentMap, _b = _a.included, included = _b === void 0 ? true : _b;
    var storeObj = store[rootId] || {};
    var storeFieldKey = storeUtils_1.storeKeyNameFromField(field, variables);
    if (!has(storeObj, storeFieldKey)) {
        if (throwOnMissingField && included) {
            throw new errors_1.ApolloError({
                errorMessage: "Can't find field " + storeFieldKey + " on object (" + rootId + ") " + JSON.stringify(storeObj, null, 2) + ".\nPerhaps you want to use the `returnPartialData` option?",
                extraInfo: {
                    isFieldError: true
                }
            });
        }
        return {
            isMissing: 'true'
        };
    }
    var storeValue = storeObj[storeFieldKey];
    // Handle all scalar types here
    if (!field.selectionSet) {
        if (store_1.isJsonValue(storeValue)) {
            // if this is an object scalar, it must be a json blob and we have to unescape it
            return {
                result: storeValue.json
            };
        }
        else {
            // if this is a non-object scalar, we can return it immediately
            return {
                result: storeValue
            };
        }
    }
    // From here down, the field has a selection set, which means it's trying to
    // query a GraphQLObjectType
    if (isNull(storeValue)) {
        // Basically any field in a GraphQL response can be null
        return {
            result: null
        };
    }
    if (isArray(storeValue)) {
        var isMissing_1;
        var result = storeValue.map(function (id) {
            // null value in array
            if (isNull(id)) {
                return null;
            }
            var itemDiffResult = diffSelectionSetAgainstStore({
                store: store,
                throwOnMissingField: throwOnMissingField,
                rootId: id,
                selectionSet: field.selectionSet,
                variables: variables,
                fragmentMap: fragmentMap
            });
            if (itemDiffResult.isMissing) {
                // XXX merge all of the missing selections from the children to get a more minimal result
                isMissing_1 = 'true';
            }
            return itemDiffResult.result;
        });
        return {
            result: result,
            isMissing: isMissing_1
        };
    }
    // If the store value is an object and it has a selection set, it must be
    // an escaped id.
    if (store_1.isIdValue(storeValue)) {
        var unescapedId = storeValue.id;
        return diffSelectionSetAgainstStore({
            store: store,
            throwOnMissingField: throwOnMissingField,
            rootId: unescapedId,
            selectionSet: field.selectionSet,
            variables: variables,
            fragmentMap: fragmentMap
        });
    }
    throw new Error('Unexpected value in the store where the query had a subselection.');
}
