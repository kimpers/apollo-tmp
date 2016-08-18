"use strict";
var actions_1 = require('../actions');
var storeUtils_1 = require('../data/storeUtils');
var assign = require('lodash.assign');
function queries(previousState, action) {
    if (previousState === void 0) { previousState = {}; }
    if (actions_1.isQueryInitAction(action)) {
        var newState = assign({}, previousState);
        // XXX right now if QUERY_INIT is fired twice, like in a refetch situation, we just overwrite
        // the store. We probably want a refetch action instead, because I suspect that if you refetch
        // before the initial fetch is done, you'll get an error.
        newState[action.queryId] = {
            queryString: action.queryString,
            query: action.query,
            minimizedQueryString: action.minimizedQueryString,
            minimizedQuery: action.minimizedQuery,
            variables: action.variables,
            loading: true,
            networkError: null,
            graphQLErrors: null,
            forceFetch: action.forceFetch,
            returnPartialData: action.returnPartialData,
            lastRequestId: action.requestId,
            fragmentMap: action.fragmentMap
        };
        return newState;
    }
    else if (actions_1.isQueryResultAction(action)) {
        if (!previousState[action.queryId]) {
            return previousState;
        }
        // Ignore results from old requests
        if (action.requestId < previousState[action.queryId].lastRequestId) {
            return previousState;
        }
        var newState = assign({}, previousState);
        var resultHasGraphQLErrors = storeUtils_1.graphQLResultHasError(action.result);
        newState[action.queryId] = assign({}, previousState[action.queryId], {
            loading: false,
            networkError: null,
            graphQLErrors: resultHasGraphQLErrors ? action.result.errors : null
        });
        return newState;
    }
    else if (actions_1.isQueryErrorAction(action)) {
        if (!previousState[action.queryId]) {
            return previousState;
        }
        // Ignore results from old requests
        if (action.requestId < previousState[action.queryId].lastRequestId) {
            return previousState;
        }
        var newState = assign({}, previousState);
        newState[action.queryId] = assign({}, previousState[action.queryId], {
            loading: false,
            networkError: action.error
        });
        return newState;
    }
    else if (actions_1.isQueryResultClientAction(action)) {
        if (!previousState[action.queryId]) {
            return previousState;
        }
        var newState = assign({}, previousState);
        newState[action.queryId] = assign({}, previousState[action.queryId], {
            loading: action.complete,
            networkError: null
        });
        return newState;
    }
    else if (actions_1.isQueryStopAction(action)) {
        var newState = assign({}, previousState);
        delete newState[action.queryId];
        return newState;
    }
    else if (actions_1.isStoreResetAction(action)) {
        return resetQueryState(previousState, action);
    }
    return previousState;
}
exports.queries = queries;
// Returns the new query state after we receive a store reset action.
// Note that we don't remove the query state for the query IDs that are associated with watchQuery()
// observables. This is because these observables are simply refetched and not
// errored in the event of a store reset.
function resetQueryState(state, action) {
    var observableQueryIds = action.observableQueryIds;
    // keep only the queries with query ids that are associated with observables
    var newQueries = Object.keys(state).filter(function (queryId) {
        return (observableQueryIds.indexOf(queryId) > -1);
    }).reduce(function (res, key) {
        res[key] = state[key];
        return res;
    }, {});
    return newQueries;
}
