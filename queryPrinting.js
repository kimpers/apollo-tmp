"use strict";
var printer_1 = require('graphql-tag/printer');
function printQueryForMissingData(options) {
    return printQueryFromDefinition(queryDefinition(options));
}
exports.printQueryForMissingData = printQueryForMissingData;
function printQueryFromDefinition(queryDef) {
    var queryDocumentAst = {
        kind: 'Document',
        definitions: [
            queryDef,
        ]
    };
    return printer_1.print(queryDocumentAst);
}
exports.printQueryFromDefinition = printQueryFromDefinition;
// Creates a query document out of the missing selection sets, named fragments, etc.
// in order to print.
function queryDocument(_a) {
    var missingSelectionSets = _a.missingSelectionSets, _b = _a.variableDefinitions, variableDefinitions = _b === void 0 ? null : _b, _c = _a.name, name = _c === void 0 ? null : _c, fragmentMap = _a.fragmentMap;
    var doc = {
        kind: 'Document',
        definitions: []
    };
    var opDefinition = queryDefinition({
        missingSelectionSets: missingSelectionSets,
        variableDefinitions: variableDefinitions,
        name: name
    });
    // add fragments to the query document
    doc.definitions = [opDefinition];
    Object.keys(fragmentMap).forEach(function (key) {
        doc.definitions.push(fragmentMap[key]);
    });
    return doc;
}
exports.queryDocument = queryDocument;
function queryDefinition(_a) {
    var missingSelectionSets = _a.missingSelectionSets, _b = _a.variableDefinitions, variableDefinitions = _b === void 0 ? null : _b, _c = _a.name, name = _c === void 0 ? null : _c;
    var selections = [];
    missingSelectionSets.forEach(function (missingSelectionSet, ii) {
        if (missingSelectionSet.id === 'CANNOT_REFETCH') {
            throw new Error('diffAgainstStore did not merge selection sets correctly');
        }
        if (missingSelectionSet.id !== 'ROOT_QUERY') {
            // At some point, put back support for the node interface. Look in the git history for
            // the code that printed node queries here.
            throw new Error('Only root query selections supported.');
        }
        missingSelectionSet.selectionSet.selections.forEach(function (selection) {
            selections.push(selection);
        });
    });
    return {
        kind: 'OperationDefinition',
        operation: 'query',
        name: name,
        variableDefinitions: variableDefinitions,
        directives: [],
        selectionSet: {
            kind: 'SelectionSet',
            selections: selections
        }
    };
}
exports.queryDefinition = queryDefinition;
