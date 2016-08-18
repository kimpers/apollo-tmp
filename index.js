"use strict";
var networkInterface_1 = require('./networkInterface');
exports.createNetworkInterface = networkInterface_1.createNetworkInterface;
exports.addQueryMerging = networkInterface_1.addQueryMerging;
var printer_1 = require('graphql-tag/printer');
exports.printAST = printer_1.print;
var store_1 = require('./store');
exports.createApolloStore = store_1.createApolloStore;
exports.createApolloReducer = store_1.createApolloReducer;
var QueryManager_1 = require('./QueryManager');
var readFromStore_1 = require('./data/readFromStore');
exports.readQueryFromStore = readFromStore_1.readQueryFromStore;
exports.readFragmentFromStore = readFromStore_1.readFragmentFromStore;
var writeToStore_1 = require('./data/writeToStore');
exports.writeQueryToStore = writeToStore_1.writeQueryToStore;
exports.writeFragmentToStore = writeToStore_1.writeFragmentToStore;
var queryTransform_1 = require('./queries/queryTransform');
exports.addTypename = queryTransform_1.addTypenameToSelectionSet;
var storeUtils_1 = require('./data/storeUtils');
var getFromAST_1 = require('./queries/getFromAST');
var isUndefined = require('lodash.isundefined');
var assign = require('lodash.assign');
var flatten = require('lodash.flatten');
// We expose the print method from GraphQL so that people that implement
// custom network interfaces can turn query ASTs into query strings as needed.
// A map going from the name of a fragment to that fragment's definition.
// The point is to keep track of fragments that exist and print a warning if we encounter two
// fragments that have the same name, i.e. the values *should* be of arrays of length 1.
// Note: this variable is exported solely for unit testing purposes. It should not be touched
// directly by application code.
exports.fragmentDefinitionsMap = {};
// Specifies whether or not we should print warnings about conflicting fragment names.
var printFragmentWarnings = true;
// Takes a document, extracts the FragmentDefinitions from it and puts
// them in this.fragmentDefinitions. The second argument specifies the fragments
// that the fragment in the document depends on. The fragment definition array from the document
// is concatenated with the fragment definition array passed as the second argument and this
// concatenated array is returned.
function createFragment(doc, fragments) {
    if (fragments === void 0) { fragments = []; }
    fragments = flatten(fragments);
    var fragmentDefinitions = getFromAST_1.getFragmentDefinitions(doc);
    fragmentDefinitions.forEach(function (fragmentDefinition) {
        var fragmentName = fragmentDefinition.name.value;
        if (exports.fragmentDefinitionsMap.hasOwnProperty(fragmentName) &&
            exports.fragmentDefinitionsMap[fragmentName].indexOf(fragmentDefinition) === -1) {
            // this is a problem because the app developer is trying to register another fragment with
            // the same name as one previously registered. So, we tell them about it.
            if (printFragmentWarnings) {
                console.warn("Warning: fragment with name " + fragmentDefinition.name.value + " already exists.\nApollo Client enforces all fragment names across your application to be unique; read more about\nthis in the docs: http://docs.apollostack.com/");
            }
            exports.fragmentDefinitionsMap[fragmentName].push(fragmentDefinition);
        }
        else if (!exports.fragmentDefinitionsMap.hasOwnProperty(fragmentName)) {
            exports.fragmentDefinitionsMap[fragmentName] = [fragmentDefinition];
        }
    });
    return fragments.concat(fragmentDefinitions);
}
exports.createFragment = createFragment;
// This function disables the warnings printed about fragment names. One place where this chould be
// called is within writing unit tests that depend on Apollo Client and use named fragments that may
// have the same name across different unit tests.
function disableFragmentWarnings() {
    printFragmentWarnings = false;
}
exports.disableFragmentWarnings = disableFragmentWarnings;
function enableFragmentWarnings() {
    printFragmentWarnings = true;
}
exports.enableFragmentWarnings = enableFragmentWarnings;
// This function is used to be empty the namespace of fragment definitions. Used for unit tests.
function clearFragmentDefinitions() {
    exports.fragmentDefinitionsMap = {};
}
exports.clearFragmentDefinitions = clearFragmentDefinitions;
var ApolloClient = (function () {
    function ApolloClient(_a) {
        var _this = this;
        var _b = _a === void 0 ? {} : _a, networkInterface = _b.networkInterface, reduxRootKey = _b.reduxRootKey, initialState = _b.initialState, dataIdFromObject = _b.dataIdFromObject, queryTransformer = _b.queryTransformer, _c = _b.shouldBatch, shouldBatch = _c === void 0 ? false : _c, _d = _b.ssrMode, ssrMode = _d === void 0 ? false : _d, _e = _b.ssrForceFetchDelay, ssrForceFetchDelay = _e === void 0 ? 0 : _e, _f = _b.mutationBehaviorReducers, mutationBehaviorReducers = _f === void 0 ? {} : _f, batchInterval = _b.batchInterval;
        this.watchQuery = function (options) {
            _this.initStore();
            if (!_this.shouldForceFetch && options.forceFetch) {
                options = assign({}, options, {
                    forceFetch: false
                });
            }
            // Register each of the fragments present in the query document. The point
            // is to prevent fragment name collisions with fragments that are in the query
            // document itself.
            createFragment(options.query);
            return _this.queryManager.watchQuery(options);
        };
        this.query = function (options) {
            _this.initStore();
            if (!_this.shouldForceFetch && options.forceFetch) {
                options = assign({}, options, {
                    forceFetch: false
                });
            }
            // Register each of the fragments present in the query document. The point
            // is to prevent fragment name collisions with fragments that are in the query
            // document itself.
            createFragment(options.query);
            return _this.queryManager.query(options);
        };
        this.mutate = function (options) {
            _this.initStore();
            return _this.queryManager.mutate(options);
        };
        this.middleware = function () {
            return function (store) {
                _this.setStore(store);
                return function (next) { return function (action) {
                    var returnValue = next(action);
                    _this.queryManager.broadcastNewStore(store.getState());
                    return returnValue;
                }; };
            };
        };
        this.setStore = function (store) {
            // ensure existing store has apolloReducer
            if (isUndefined(store.getState()[_this.reduxRootKey])) {
                throw new Error("Existing store does not use apolloReducer for " + _this.reduxRootKey);
            }
            _this.store = store;
            _this.queryManager = new QueryManager_1.QueryManager({
                networkInterface: _this.networkInterface,
                reduxRootKey: _this.reduxRootKey,
                store: store,
                queryTransformer: _this.queryTransformer,
                shouldBatch: _this.shouldBatch,
                batchInterval: _this.batchInterval
            });
        };
        this.reduxRootKey = reduxRootKey ? reduxRootKey : 'apollo';
        this.initialState = initialState ? initialState : {};
        this.networkInterface = networkInterface ? networkInterface :
            networkInterface_1.createNetworkInterface('/graphql');
        this.queryTransformer = queryTransformer;
        this.shouldBatch = shouldBatch;
        this.shouldForceFetch = !(ssrMode || ssrForceFetchDelay > 0);
        this.dataId = dataIdFromObject;
        this.fieldWithArgs = storeUtils_1.storeKeyNameFromFieldNameAndArgs;
        this.batchInterval = batchInterval;
        if (ssrForceFetchDelay) {
            setTimeout(function () { return _this.shouldForceFetch = true; }, ssrForceFetchDelay);
        }
        this.reducerConfig = {
            dataIdFromObject: dataIdFromObject,
            mutationBehaviorReducers: mutationBehaviorReducers
        };
    }
    ApolloClient.prototype.reducer = function () {
        return store_1.createApolloReducer(this.reducerConfig);
    };
    ApolloClient.prototype.initStore = function () {
        if (this.store) {
            // Don't do anything if we already have a store
            return;
        }
        // If we don't have a store already, initialize a default one
        this.setStore(store_1.createApolloStore({
            reduxRootKey: this.reduxRootKey,
            initialState: this.initialState,
            config: this.reducerConfig
        }));
    };
    ;
    return ApolloClient;
}());
exports.__esModule = true;
exports["default"] = ApolloClient;
