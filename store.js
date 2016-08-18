"use strict";
var redux_1 = require('redux');
var store_1 = require('./data/store');
var store_2 = require('./queries/store');
var store_3 = require('./mutations/store');
var store_4 = require('./optimistic-data/store');
var assign = require('lodash.assign');
var crashReporter = function (store) { return function (next) { return function (action) {
    try {
        return next(action);
    }
    catch (err) {
        console.error('Caught an exception!', err);
        console.error(err.stack);
        throw err;
    }
}; }; };
function createApolloReducer(config) {
    return function apolloReducer(state, action) {
        if (state === void 0) { state = {}; }
        var newState = {
            queries: store_2.queries(state.queries, action),
            mutations: store_3.mutations(state.mutations, action),
            // Note that we are passing the queries into this, because it reads them to associate
            // the query ID in the result with the actual query
            data: store_1.data(state.data, action, state.queries, state.mutations, config),
            optimistic: []
        };
        // Note, we need to have the results of the
        // APOLLO_MUTATION_INIT action to simulate
        // the APOLLO_MUTATION_RESULT action. That's
        // why we pass in newState
        newState.optimistic = store_4.optimistic(state.optimistic, action, newState, config);
        return newState;
    };
}
exports.createApolloReducer = createApolloReducer;
function createApolloStore(_a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.reduxRootKey, reduxRootKey = _c === void 0 ? 'apollo' : _c, initialState = _b.initialState, _d = _b.config, config = _d === void 0 ? {} : _d, reportCrashes = _b.reportCrashes;
    var enhancers = [];
    if (reportCrashes === undefined) {
        reportCrashes = true;
    }
    if (typeof window !== 'undefined') {
        var anyWindow = window;
        if (anyWindow.devToolsExtension) {
            enhancers.push(anyWindow.devToolsExtension());
        }
    }
    if (reportCrashes) {
        enhancers.push(redux_1.applyMiddleware(crashReporter));
    }
    return redux_1.createStore(redux_1.combineReducers((_e = {}, _e[reduxRootKey] = createApolloReducer(config), _e)), initialState, redux_1.compose.apply(void 0, enhancers) // XXX see why this type fails
    );
    var _e;
}
exports.createApolloStore = createApolloStore;
function getDataWithOptimisticResults(store) {
    var patches = store.optimistic.map(function (opt) { return opt.data; });
    return assign.apply(void 0, [{}, store.data].concat(patches));
}
exports.getDataWithOptimisticResults = getDataWithOptimisticResults;
