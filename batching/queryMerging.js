// Implements a style of query merging in which two queries are merged together
// under one root query and given aliases. It doesn't do deep merging, i.e. queries
// are merged at top level into one bigger query - we don't eliminate fields based on
// whether or not they are present in both queries.
"use strict";
var getFromAST_1 = require('../queries/getFromAST');
var storeUtils_1 = require('../data/storeUtils');
var assign = require('lodash.assign');
var cloneDeep = require('lodash.clonedeep');
// Merges requests together.
// NOTE: This is pretty much the only function from this file that should be
// called from outside of this file. It guarantees that the requests you pass in
// will remain unchanged.
function mergeRequests(requests) {
    // NOTE: subsequent calls actually modify the request object and/or GQL document.
    // So, to avoid changing the request passed in, we clone the whole request tree.
    var rootQueryDoc = createEmptyRootQueryDoc();
    var rootVariables;
    requests.forEach(function (request, requestIndex) {
        request = cloneDeep(request);
        rootQueryDoc = addQueryToRoot(rootQueryDoc, request.query, requestIndex);
        if (request.variables) {
            rootVariables = addVariablesToRoot(rootVariables, request.variables, request.query, requestIndex);
        }
    });
    var rootRequest = {
        debugName: '___composed',
        query: rootQueryDoc,
        variables: rootVariables
    };
    return rootRequest;
}
exports.mergeRequests = mergeRequests;
function unpackMergedResult(result, childRequests) {
    var resultArray = new Array(childRequests.length);
    var fieldMaps = createFieldMapsForRequests(childRequests);
    Object.keys(result.data).forEach(function (dataKey) {
        var data = {};
        var mergeInfo = parseMergedKey(dataKey);
        var childRequestIndex = mergeInfo.requestIndex;
        var fieldMap = fieldMaps[childRequestIndex];
        var field = fieldMap[mergeInfo.fieldIndex];
        data[storeUtils_1.resultKeyNameFromField(field)] = result.data[dataKey];
        if (resultArray[childRequestIndex]) {
            assign(resultArray[childRequestIndex].data, data);
        }
        else {
            resultArray[childRequestIndex] = { data: data };
        }
    });
    return resultArray;
}
exports.unpackMergedResult = unpackMergedResult;
function createFieldMapsForRequests(requests) {
    var res = new Array(requests.length);
    requests.forEach(function (request, requestIndex) {
        var operationDef = getFromAST_1.getQueryDefinition(request.query);
        var fragmentDefs = getFromAST_1.getFragmentDefinitions(request.query);
        var fieldMap = {};
        [operationDef].concat(fragmentDefs).forEach(function (def) {
            assign(fieldMap, createFieldMap(def.selectionSet.selections).fieldMap);
        });
        res[requestIndex] = fieldMap;
    });
    return res;
}
exports.createFieldMapsForRequests = createFieldMapsForRequests;
// Returns a map that goes from a field index to a particular selection within a
// request. We need this thing because inline fragments make it so that we
// can't just index into the SelectionSet.selections array given the field index.
// Also returns the next index to be used (this is used internally since the function
// is recursive).
function createFieldMap(selections, startIndex) {
    if (!startIndex) {
        startIndex = 0;
    }
    var fieldMap = {};
    var currIndex = startIndex;
    selections.forEach(function (selection) {
        if (selection.kind === 'Field') {
            fieldMap[currIndex] = selection;
            currIndex += 1;
        }
        else if (selection.kind === 'InlineFragment') {
            var inlineFragment = selection;
            var ret = createFieldMap(inlineFragment.selectionSet.selections, currIndex);
            assign(fieldMap, ret.fieldMap);
            currIndex = ret.newIndex;
        }
    });
    return {
        fieldMap: fieldMap,
        newIndex: currIndex
    };
}
exports.createFieldMap = createFieldMap;
// Takes a key that looks like this: ___queryName___requestIndex_0___fieldIndex_1: __typename
// And turns it into information like this { requestIndex: 0, fieldIndex: 1 }
function parseMergedKey(key) {
    var pieces = key.split('___');
    var requestIndexPiece = pieces[2].split('_');
    var fieldIndexPiece = pieces[3].split('_');
    return {
        requestIndex: parseInt(requestIndexPiece[1], 10),
        fieldIndex: parseInt(fieldIndexPiece[1], 10)
    };
}
exports.parseMergedKey = parseMergedKey;
// Merges multiple queries into a single document. Starts out with an empty root
// query. Used primarily to unit test addQueryToRoot.
// Note: this method does NOT guarantee that the child query documents will remain
// unchanged.
function mergeQueryDocuments(childQueryDocs) {
    var rootQueryDoc = createEmptyRootQueryDoc();
    childQueryDocs.forEach(function (childQueryDoc, childQueryDocIndex) {
        rootQueryDoc = addQueryToRoot(rootQueryDoc, childQueryDoc, childQueryDocIndex);
    });
    return rootQueryDoc;
}
exports.mergeQueryDocuments = mergeQueryDocuments;
// Adds a variable object to an existing variable object by aliasing names to
// prevent conflicts.
function addVariablesToRoot(rootVariables, childVariables, childQueryDoc, childQueryDocIndex) {
    var aliasName = getOperationDefinitionName(getFromAST_1.getQueryDefinition(childQueryDoc), childQueryDocIndex);
    var aliasedChildVariables = addPrefixToVariables(aliasName + '___', childVariables);
    return assign({}, rootVariables, aliasedChildVariables);
}
exports.addVariablesToRoot = addVariablesToRoot;
// Takes a query to add to a root query and aliases the child query's top-level
// field names.
function addQueryToRoot(rootQueryDoc, childQueryDoc, childQueryDocIndex) {
    var aliasName = getOperationDefinitionName(getFromAST_1.getQueryDefinition(childQueryDoc), childQueryDocIndex);
    var aliasedChild = applyAliasNameToDocument(childQueryDoc, aliasName);
    var aliasedChildQueryDef = getFromAST_1.getQueryDefinition(aliasedChild);
    var aliasedChildFragmentDefs = getFromAST_1.getFragmentDefinitions(aliasedChild);
    var rootQueryDef = getFromAST_1.getQueryDefinition(rootQueryDoc);
    rootQueryDoc.definitions = rootQueryDoc.definitions.concat(aliasedChildFragmentDefs);
    rootQueryDef.selectionSet.selections =
        rootQueryDef.selectionSet.selections.concat(aliasedChildQueryDef.selectionSet.selections);
    rootQueryDef.variableDefinitions =
        rootQueryDef.variableDefinitions.concat(aliasedChildQueryDef.variableDefinitions);
    return rootQueryDoc;
}
exports.addQueryToRoot = addQueryToRoot;
function createEmptyRootQueryDoc(rootQueryName) {
    if (!rootQueryName) {
        rootQueryName = '___composed';
    }
    return {
        kind: 'Document',
        definitions: [
            {
                kind: 'OperationDefinition',
                operation: 'query',
                name: {
                    kind: 'Name',
                    value: rootQueryName
                },
                variableDefinitions: [],
                directives: [],
                selectionSet: {
                    kind: 'SelectionSet',
                    selections: []
                }
            },
        ]
    };
}
exports.createEmptyRootQueryDoc = createEmptyRootQueryDoc;
// Recursively steps through the query tree and renames the query fragment spreads to
// their aliased names.
function renameFragmentSpreads(selSet, aliasName) {
    if (selSet && selSet.selections) {
        selSet.selections = selSet.selections.map(function (selection) {
            if (selection.kind === 'FragmentSpread') {
                var fragmentSpread = selection;
                fragmentSpread.name.value = getFragmentAliasName(fragmentSpread, aliasName);
                return fragmentSpread;
            }
            else {
                var withSelSet = selection;
                withSelSet.selectionSet = renameFragmentSpreads(withSelSet.selectionSet, aliasName);
                return selection;
            }
        });
    }
    return selSet;
}
exports.renameFragmentSpreads = renameFragmentSpreads;
function renameVariables(selSet, aliasName) {
    if (selSet && selSet.selections) {
        selSet.selections = selSet.selections.map(function (selection) {
            if (selection.kind === 'Field') {
                var field = selection;
                if (field.arguments) {
                    field.arguments = field.arguments.map(function (argument) {
                        if (argument.kind === 'Argument' &&
                            argument.value.kind === 'Variable') {
                            var varx = argument.value;
                            argument.value.name.value = getVariableAliasName(varx, aliasName);
                        }
                        return argument;
                    });
                }
                field.selectionSet = renameVariables(field.selectionSet, aliasName);
                return field;
            }
            else if (selection.kind === 'InlineFragment') {
                var inlineFragment = selection;
                inlineFragment.selectionSet = renameVariables(inlineFragment.selectionSet, aliasName);
                return inlineFragment;
            }
            return selection;
        });
    }
    return selSet;
}
exports.renameVariables = renameVariables;
function applyAliasNameToVariableDefinition(vDef, aliasName) {
    if (containsMarker(vDef.variable.name.value)) {
        throw new Error("Variable definition for " + vDef.variable.name.value + " contains \"___\"");
    }
    vDef.variable.name.value = getVariableAliasName(vDef.variable, aliasName);
    return vDef;
}
exports.applyAliasNameToVariableDefinition = applyAliasNameToVariableDefinition;
function applyAliasNameToDocument(document, aliasName) {
    //replace the fragment spread names
    document.definitions = document.definitions.map(function (definition) {
        var operationOrFragmentDef = definition;
        operationOrFragmentDef.selectionSet =
            renameFragmentSpreads(operationOrFragmentDef.selectionSet, aliasName);
        operationOrFragmentDef.selectionSet =
            renameVariables(operationOrFragmentDef.selectionSet, aliasName);
        return operationOrFragmentDef;
    });
    // replace the definitions within the document with the aliased versions
    // of those definitions.
    var currStartIndex = 0;
    document.definitions = document.definitions.map(function (definition) {
        if (definition.kind === 'OperationDefinition' &&
            definition.operation === 'query') {
            var operationDef = definition;
            if (operationDef.variableDefinitions) {
                operationDef.variableDefinitions =
                    operationDef.variableDefinitions.map(function (vDef) {
                        return applyAliasNameToVariableDefinition(vDef, aliasName);
                    });
            }
            var retDef = applyAliasNameToTopLevelFields(operationDef, aliasName, currStartIndex);
            currStartIndex += operationDef.selectionSet.selections.length;
            return retDef;
        }
        else if (definition.kind === 'FragmentDefinition') {
            var fragmentDef = definition;
            var retDef = applyAliasNameToFragment(fragmentDef, aliasName, currStartIndex);
            currStartIndex += fragmentDef.selectionSet.selections.length;
            return retDef;
        }
        else {
            throw new Error('Cannot apply alias names to documents that contain mutations.');
        }
    });
    return document;
}
exports.applyAliasNameToDocument = applyAliasNameToDocument;
function applyAliasNameToFragment(fragment, aliasName, startIndex) {
    if (containsMarker(fragment.name.value)) {
        throw new Error("Fragment " + fragment.name.value + " contains \"___\"");
    }
    fragment.name.value = getFragmentAliasName(fragment, aliasName);
    fragment.selectionSet.selections =
        applyAliasNameToSelections(fragment.selectionSet.selections, aliasName, startIndex).res;
    return fragment;
}
exports.applyAliasNameToFragment = applyAliasNameToFragment;
// Applies the alias name to the top level fields of a query.
function applyAliasNameToTopLevelFields(childQuery, aliasName, startIndex) {
    childQuery.selectionSet.selections =
        applyAliasNameToSelections(childQuery.selectionSet.selections, aliasName, startIndex).res;
    return childQuery;
}
exports.applyAliasNameToTopLevelFields = applyAliasNameToTopLevelFields;
function getVariableAliasName(varNode, aliasName) {
    return aliasName + "___" + varNode.name.value;
}
exports.getVariableAliasName = getVariableAliasName;
function getFragmentAliasName(fragment, queryAliasName) {
    return queryAliasName + "___" + fragment.name.value;
}
exports.getFragmentAliasName = getFragmentAliasName;
// Returns an alias name for the query using the query's index
// within a list of queries and the query object. For example, if a
// query's name is "listOfAuthors" and has index "3", the name will
// be "___listOfAuthors___requestIndex_3".
function getOperationDefinitionName(operationDef, requestIndex) {
    var operationDefName = '';
    if (operationDef.name) {
        operationDefName = operationDef.name.value;
    }
    return "___" + operationDefName + "___requestIndex_" + requestIndex;
}
exports.getOperationDefinitionName = getOperationDefinitionName;
function aliasField(field, alias) {
    if (containsMarker(field.name.value)) {
        throw new Error("Field " + field.name.value + " contains \"___\".");
    }
    field.alias = {
        kind: 'Name',
        value: alias
    };
    return field;
}
exports.aliasField = aliasField;
function addPrefixToQuery(prefix, query) {
    if (query.name) {
        query.name.value = prefix + query.name.value;
    }
    return query;
}
exports.addPrefixToQuery = addPrefixToQuery;
function addPrefixToVariables(prefix, variables) {
    var newVariables = {};
    Object.keys(variables).forEach(function (variableName) {
        newVariables[prefix + variableName] = variables[variableName];
    });
    return newVariables;
}
exports.addPrefixToVariables = addPrefixToVariables;
function applyAliasNameToSelections(selections, aliasName, startIndex) {
    var currIndex = startIndex;
    var res = selections.map(function (selection) {
        if (selection.kind === 'Field') {
            var aliasedField = aliasField(selection, aliasName + "___fieldIndex_" + currIndex);
            currIndex += 1;
            return aliasedField;
        }
        else if (selection.kind === 'InlineFragment') {
            var inlineFragment = selection;
            var ret = applyAliasNameToSelections(inlineFragment.selectionSet.selections, aliasName, currIndex);
            inlineFragment.selectionSet.selections = ret.res;
            currIndex = ret.newIndex;
            return inlineFragment;
        }
        else {
            return selection;
        }
    });
    return {
        res: res,
        newIndex: currIndex
    };
}
// Checks if the name of something starts with the separating marker (i.e. "___")
function containsMarker(name) {
    return name.indexOf('___') > -1;
}
