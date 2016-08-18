"use strict";
var forOwn = require('lodash.forown');
var isEqual = require('lodash.isequal');
var store_1 = require('./store');
var getFromAST_1 = require('./queries/getFromAST');
var queryTransform_1 = require('./queries/queryTransform');
var printer_1 = require('graphql-tag/printer');
var readFromStore_1 = require('./data/readFromStore');
var diffAgainstStore_1 = require('./data/diffAgainstStore');
var queryPrinting_1 = require('./queryPrinting');
var batching_1 = require('./batching');
var scheduler_1 = require('./scheduler');
var errorHandling_1 = require('./util/errorHandling');
var errors_1 = require('./errors');
var ObservableQuery_1 = require('./ObservableQuery');
var QueryManager = (function () {
    function QueryManager(_a) {
        var _this = this;
        var networkInterface = _a.networkInterface, store = _a.store, reduxRootKey = _a.reduxRootKey, queryTransformer = _a.queryTransformer, _b = _a.shouldBatch, shouldBatch = _b === void 0 ? false : _b, _c = _a.batchInterval, batchInterval = _c === void 0 ? 10 : _c;
        this.idCounter = 0;
        // XXX this might be the place to do introspection for inserting the `id` into the query? or
        // is that the network interface?
        this.networkInterface = networkInterface;
        this.store = store;
        this.reduxRootKey = reduxRootKey;
        this.queryTransformer = queryTransformer;
        this.pollingTimers = {};
        this.batchInterval = batchInterval;
        this.queryListeners = {};
        this.queryResults = {};
        this.scheduler = new scheduler_1.QueryScheduler({
            queryManager: this
        });
        this.batcher = new batching_1.QueryBatcher({
            shouldBatch: shouldBatch,
            networkInterface: this.networkInterface
        });
        this.batcher.start(this.batchInterval);
        this.fetchQueryPromises = {};
        this.observableQueries = {};
        this.queryIdsByName = {};
        // this.store is usually the fake store we get from the Redux middleware API
        // XXX for tests, we sometimes pass in a real Redux store into the QueryManager
        if (this.store['subscribe']) {
            var currentStoreData_1;
            this.store['subscribe'](function () {
                var previousStoreData = currentStoreData_1 || {};
                var previousStoreHasData = Object.keys(previousStoreData).length;
                currentStoreData_1 = _this.getApolloState();
                if (isEqual(previousStoreData, currentStoreData_1) && previousStoreHasData) {
                    return;
                }
                _this.broadcastQueries();
            });
        }
    }
    // Called from middleware
    QueryManager.prototype.broadcastNewStore = function (store) {
        this.broadcastQueries();
    };
    QueryManager.prototype.mutate = function (_a) {
        var _this = this;
        var mutation = _a.mutation, variables = _a.variables, _b = _a.resultBehaviors, resultBehaviors = _b === void 0 ? [] : _b, _c = _a.fragments, fragments = _c === void 0 ? [] : _c, optimisticResponse = _a.optimisticResponse, updateQueries = _a.updateQueries, _d = _a.refetchQueries, refetchQueries = _d === void 0 ? [] : _d;
        var mutationId = this.generateQueryId();
        // Add the fragments that were passed in to the mutation document and then
        // construct the fragment map.
        mutation = getFromAST_1.addFragmentsToDocument(mutation, fragments);
        if (this.queryTransformer) {
            mutation = queryTransform_1.applyTransformers(mutation, [this.queryTransformer]);
        }
        var mutationDef = getFromAST_1.getMutationDefinition(mutation);
        var mutationString = printer_1.print(mutation);
        var queryFragmentMap = getFromAST_1.createFragmentMap(getFromAST_1.getFragmentDefinitions(mutation));
        var request = {
            query: mutation,
            variables: variables,
            operationName: getFromAST_1.getOperationName(mutation)
        };
        // Right now the way `updateQueries` feature is implemented relies on using
        // `resultBehaviors`, another feature that accomplishes the same goal but
        // provides more verbose syntax.
        // In the future we want to re-factor this part of code to avoid using
        // `resultBehaviors` so we can remove `resultBehaviors` entirely.
        var updateQueriesResultBehaviors = !optimisticResponse ? [] :
            this.collectResultBehaviorsFromUpdateQueries(updateQueries, { data: optimisticResponse }, true);
        this.store.dispatch({
            type: 'APOLLO_MUTATION_INIT',
            mutationString: mutationString,
            mutation: {
                id: 'ROOT_MUTATION',
                typeName: 'Mutation',
                selectionSet: mutationDef.selectionSet
            },
            variables: variables,
            mutationId: mutationId,
            fragmentMap: queryFragmentMap,
            optimisticResponse: optimisticResponse,
            resultBehaviors: resultBehaviors.concat(updateQueriesResultBehaviors)
        });
        return new Promise(function (resolve, reject) {
            _this.networkInterface.query(request)
                .then(function (result) {
                if (result.errors) {
                    reject(new errors_1.ApolloError({
                        graphQLErrors: result.errors
                    }));
                }
                _this.store.dispatch({
                    type: 'APOLLO_MUTATION_RESULT',
                    result: result,
                    mutationId: mutationId,
                    resultBehaviors: resultBehaviors.concat(_this.collectResultBehaviorsFromUpdateQueries(updateQueries, result))
                });
                refetchQueries.forEach(function (name) { _this.refetchQueryByName(name); });
                resolve(result);
            })
                .catch(function (err) {
                _this.store.dispatch({
                    type: 'APOLLO_MUTATION_ERROR',
                    error: err,
                    mutationId: mutationId
                });
                reject(new errors_1.ApolloError({
                    networkError: err
                }));
            });
        });
    };
    // Returns a query listener that will update the given observer based on the
    // results (or lack thereof) for a particular query.
    QueryManager.prototype.queryListenerForObserver = function (queryId, options, observer) {
        var _this = this;
        return function (queryStoreValue) {
            // The query store value can be undefined in the event of a store
            // reset.
            if (!queryStoreValue) {
                return;
            }
            if (!queryStoreValue.loading || queryStoreValue.returnPartialData) {
                // XXX Currently, returning errors and data is exclusive because we
                // don't handle partial results
                // If we have either a GraphQL error or a network error, we create
                // an error and tell the observer about it.
                if (queryStoreValue.graphQLErrors || queryStoreValue.networkError) {
                    var apolloError = new errors_1.ApolloError({
                        graphQLErrors: queryStoreValue.graphQLErrors,
                        networkError: queryStoreValue.networkError
                    });
                    if (observer.error) {
                        observer.error(apolloError);
                    }
                    else {
                        console.error('Unhandled error', apolloError, apolloError.stack);
                    }
                }
                else {
                    try {
                        var resultFromStore = {
                            data: readFromStore_1.readSelectionSetFromStore({
                                store: _this.getDataWithOptimisticResults(),
                                rootId: queryStoreValue.query.id,
                                selectionSet: queryStoreValue.query.selectionSet,
                                variables: queryStoreValue.variables,
                                returnPartialData: options.returnPartialData || options.noFetch,
                                fragmentMap: queryStoreValue.fragmentMap
                            }),
                            loading: queryStoreValue.loading
                        };
                        if (observer.next) {
                            if (_this.isDifferentResult(queryId, resultFromStore)) {
                                _this.queryResults[queryId] = resultFromStore;
                                observer.next(resultFromStore);
                            }
                        }
                    }
                    catch (error) {
                        if (observer.error) {
                            observer.error(error);
                        }
                    }
                }
            }
        };
    };
    // The shouldSubscribe option is a temporary fix that tells us whether watchQuery was called
    // directly (i.e. through ApolloClient) or through the query method within QueryManager.
    // Currently, the query method uses watchQuery in order to handle non-network errors correctly
    // but we don't want to keep track observables issued for the query method since those aren't
    // supposed to be refetched in the event of a store reset. Once we unify error handling for
    // network errors and non-network errors, the shouldSubscribe option will go away.
    // The fragments option within WatchQueryOptions specifies a list of fragments that can be
    // referenced by the query.
    // These fragments are used to compose queries out of a bunch of fragments for UI components.
    QueryManager.prototype.watchQuery = function (options, shouldSubscribe) {
        if (shouldSubscribe === void 0) { shouldSubscribe = true; }
        // Call just to get errors synchronously
        getFromAST_1.getQueryDefinition(options.query);
        var observableQuery = new ObservableQuery_1.ObservableQuery({
            scheduler: this.scheduler,
            options: options,
            shouldSubscribe: shouldSubscribe
        });
        return observableQuery;
    };
    QueryManager.prototype.query = function (options) {
        var _this = this;
        if (options.returnPartialData) {
            throw new Error('returnPartialData option only supported on watchQuery.');
        }
        if (options.query.kind !== 'Document') {
            throw new Error('You must wrap the query string in a "gql" tag.');
        }
        var requestId = this.idCounter;
        var resPromise = new Promise(function (resolve, reject) {
            _this.addFetchQueryPromise(requestId, resPromise, resolve, reject);
            return _this.watchQuery(options, false).result().then(function (result) {
                _this.removeFetchQueryPromise(requestId);
                resolve(result);
            }).catch(function (error) {
                _this.removeFetchQueryPromise(requestId);
                reject(error);
            });
        });
        return resPromise;
    };
    QueryManager.prototype.fetchQuery = function (queryId, options) {
        return this.fetchQueryOverInterface(queryId, options, this.networkInterface);
    };
    QueryManager.prototype.generateQueryId = function () {
        var queryId = this.idCounter.toString();
        this.idCounter++;
        return queryId;
    };
    QueryManager.prototype.stopQueryInStore = function (queryId) {
        this.store.dispatch({
            type: 'APOLLO_QUERY_STOP',
            queryId: queryId
        });
    };
    ;
    QueryManager.prototype.getApolloState = function () {
        return this.store.getState()[this.reduxRootKey];
    };
    QueryManager.prototype.getDataWithOptimisticResults = function () {
        return store_1.getDataWithOptimisticResults(this.getApolloState());
    };
    QueryManager.prototype.addQueryListener = function (queryId, listener) {
        this.queryListeners[queryId] = listener;
    };
    ;
    QueryManager.prototype.removeQueryListener = function (queryId) {
        delete this.queryListeners[queryId];
    };
    // Adds a promise to this.fetchQueryPromises for a given request ID.
    QueryManager.prototype.addFetchQueryPromise = function (requestId, promise, resolve, reject) {
        this.fetchQueryPromises[requestId.toString()] = { promise: promise, resolve: resolve, reject: reject };
    };
    // Removes the promise in this.fetchQueryPromises for a particular request ID.
    QueryManager.prototype.removeFetchQueryPromise = function (requestId) {
        delete this.fetchQueryPromises[requestId.toString()];
    };
    // Adds an ObservableQuery to this.observableQueries and to this.observableQueriesByName.
    QueryManager.prototype.addObservableQuery = function (queryId, observableQuery) {
        this.observableQueries[queryId] = { observableQuery: observableQuery, subscriptions: [] };
        // Insert the ObservableQuery into this.observableQueriesByName if the query has a name
        var queryDef = getFromAST_1.getQueryDefinition(observableQuery.options.query);
        if (queryDef.name && queryDef.name.value) {
            var queryName = getFromAST_1.getQueryDefinition(observableQuery.options.query).name.value;
            // XXX we may we want to warn the user about query name conflicts in the future
            this.queryIdsByName[queryName] = this.queryIdsByName[queryName] || [];
            this.queryIdsByName[queryName].push(observableQuery.queryId);
        }
    };
    // Associates a query subscription with an ObservableQuery in this.observableQueries
    QueryManager.prototype.addQuerySubscription = function (queryId, querySubscription) {
        if (this.observableQueries.hasOwnProperty(queryId)) {
            this.observableQueries[queryId].subscriptions.push(querySubscription);
        }
        else {
            this.observableQueries[queryId] = {
                observableQuery: null,
                subscriptions: [querySubscription]
            };
        }
    };
    QueryManager.prototype.removeObservableQuery = function (queryId) {
        var observableQuery = this.observableQueries[queryId].observableQuery;
        var queryName = getFromAST_1.getQueryDefinition(observableQuery.options.query).name.value;
        delete this.observableQueries[queryId];
        this.queryIdsByName[queryName] = this.queryIdsByName[queryName].filter(function (val) {
            return !(observableQuery.queryId === val);
        });
    };
    QueryManager.prototype.resetStore = function () {
        var _this = this;
        // Before we have sent the reset action to the store,
        // we can no longer rely on the results returned by in-flight
        // requests since these may depend on values that previously existed
        // in the data portion of the store. So, we cancel the promises and observers
        // that we have issued so far and not yet resolved (in the case of
        // queries).
        Object.keys(this.fetchQueryPromises).forEach(function (key) {
            var reject = _this.fetchQueryPromises[key].reject;
            reject(new Error('Store reset while query was in flight.'));
        });
        this.store.dispatch({
            type: 'APOLLO_STORE_RESET',
            observableQueryIds: Object.keys(this.observableQueries)
        });
        // Similarly, we have to have to refetch each of the queries currently being
        // observed. We refetch instead of error'ing on these since the assumption is that
        // resetting the store doesn't eliminate the need for the queries currently being
        // watched. If there is an existing query in flight when the store is reset,
        // the promise for it will be rejected and its results will not be written to the
        // store.
        Object.keys(this.observableQueries).forEach(function (queryId) {
            if (!_this.observableQueries[queryId].observableQuery.options.noFetch) {
                _this.observableQueries[queryId].observableQuery.refetch();
            }
        });
    };
    QueryManager.prototype.startQuery = function (queryId, options, listener) {
        this.queryListeners[queryId] = listener;
        // If the pollInterval is present, the scheduler has already taken care of firing the first
        // fetch so we don't have to worry about it here.
        if (!options.pollInterval) {
            this.fetchQuery(queryId, options);
        }
        return queryId;
    };
    QueryManager.prototype.stopQuery = function (queryId) {
        // XXX in the future if we should cancel the request
        // so that it never tries to return data
        delete this.queryListeners[queryId];
        this.stopQueryInStore(queryId);
    };
    QueryManager.prototype.getQueryWithPreviousResult = function (queryId, isOptimistic) {
        if (isOptimistic === void 0) { isOptimistic = false; }
        if (!this.observableQueries[queryId]) {
            throw new Error("ObservableQuery with this id doesn't exist: " + queryId);
        }
        var observableQuery = this.observableQueries[queryId].observableQuery;
        var queryOptions = observableQuery.options;
        var fragments = queryOptions.fragments;
        var queryDefinition = getFromAST_1.getQueryDefinition(queryOptions.query);
        if (this.queryTransformer) {
            var doc = {
                kind: 'Document',
                definitions: [
                    queryDefinition
                ].concat((fragments || []))
            };
            var transformedDoc = queryTransform_1.applyTransformers(doc, [this.queryTransformer]);
            queryDefinition = getFromAST_1.getQueryDefinition(transformedDoc);
            fragments = getFromAST_1.getFragmentDefinitions(transformedDoc);
        }
        var previousResult = readFromStore_1.readSelectionSetFromStore({
            // In case of an optimistic change, apply reducer on top of the
            // results including previous optimistic updates. Otherwise, apply it
            // on top of the real data only.
            store: isOptimistic ? this.getDataWithOptimisticResults() : this.getApolloState().data,
            rootId: 'ROOT_QUERY',
            selectionSet: queryDefinition.selectionSet,
            variables: queryOptions.variables,
            returnPartialData: queryOptions.returnPartialData || queryOptions.noFetch,
            fragmentMap: getFromAST_1.createFragmentMap(fragments || [])
        });
        return {
            previousResult: previousResult,
            queryVariables: queryOptions.variables,
            querySelectionSet: queryDefinition.selectionSet,
            queryFragments: fragments
        };
    };
    QueryManager.prototype.collectResultBehaviorsFromUpdateQueries = function (updateQueries, mutationResult, isOptimistic) {
        var _this = this;
        if (isOptimistic === void 0) { isOptimistic = false; }
        if (!updateQueries) {
            return [];
        }
        var resultBehaviors = [];
        Object.keys(updateQueries).forEach(function (queryName) {
            var reducer = updateQueries[queryName];
            var queryIds = _this.queryIdsByName[queryName];
            if (!queryIds) {
                // XXX should throw an error?
                return;
            }
            queryIds.forEach(function (queryId) {
                var _a = _this.getQueryWithPreviousResult(queryId, isOptimistic), previousResult = _a.previousResult, queryVariables = _a.queryVariables, querySelectionSet = _a.querySelectionSet, queryFragments = _a.queryFragments;
                var newResult = errorHandling_1.tryFunctionOrLogError(function () { return reducer(previousResult, {
                    mutationResult: mutationResult,
                    queryName: queryName,
                    queryVariables: queryVariables
                }); });
                if (newResult) {
                    resultBehaviors.push({
                        type: 'QUERY_RESULT',
                        newResult: newResult,
                        queryVariables: queryVariables,
                        querySelectionSet: querySelectionSet,
                        queryFragments: queryFragments
                    });
                }
            });
        });
        return resultBehaviors;
    };
    // Takes a set of WatchQueryOptions and transforms the query document
    // accordingly. Specifically, it does the following:
    // 1. Adds the fragments to the document
    // 2. Applies the queryTransformer (if there is one defined)
    // 3. Creates a fragment map out of all of the fragment definitions within the query
    //    document.
    // 4. Returns the final query document and the fragment map associated with the
    //    query.
    QueryManager.prototype.transformQueryDocument = function (options) {
        var query = options.query, _a = options.fragments, fragments = _a === void 0 ? [] : _a;
        var queryDoc = getFromAST_1.addFragmentsToDocument(query, fragments);
        // Apply the query transformer if one has been provided
        if (this.queryTransformer) {
            queryDoc = queryTransform_1.applyTransformers(queryDoc, [this.queryTransformer]);
        }
        return {
            queryDoc: queryDoc,
            fragmentMap: getFromAST_1.createFragmentMap(getFromAST_1.getFragmentDefinitions(queryDoc))
        };
    };
    // Takes a selection set for a query and diffs it against the store.
    // Returns a query document of selection sets
    // that must be fetched from the server and as well as the  data returned from the store.
    QueryManager.prototype.handleDiffQuery = function (_a) {
        var queryDef = _a.queryDef, rootId = _a.rootId, variables = _a.variables, fragmentMap = _a.fragmentMap, noFetch = _a.noFetch;
        var _b = diffAgainstStore_1.diffSelectionSetAgainstStore({
            selectionSet: queryDef.selectionSet,
            store: this.store.getState()[this.reduxRootKey].data,
            throwOnMissingField: false,
            rootId: rootId,
            variables: variables,
            fragmentMap: fragmentMap
        }), missingSelectionSets = _b.missingSelectionSets, result = _b.result;
        var initialResult = result;
        var diffedQuery;
        if (missingSelectionSets && missingSelectionSets.length && !noFetch) {
            diffedQuery = queryPrinting_1.queryDocument({
                missingSelectionSets: missingSelectionSets,
                variableDefinitions: queryDef.variableDefinitions,
                name: queryDef.name,
                fragmentMap: fragmentMap
            });
        }
        return {
            diffedQuery: diffedQuery,
            initialResult: initialResult
        };
    };
    // Takes a request id, query id, a query document and information asscoaiated with the query
    // (e.g. variables, fragment map, etc.) and send it to the network interface. Returns
    // a promise for the result associated with that request.
    QueryManager.prototype.fetchRequest = function (_a) {
        var _this = this;
        var requestId = _a.requestId, queryId = _a.queryId, query = _a.query, querySS = _a.querySS, options = _a.options, fragmentMap = _a.fragmentMap, networkInterface = _a.networkInterface;
        var variables = options.variables, noFetch = options.noFetch, returnPartialData = options.returnPartialData;
        var request = {
            query: query,
            variables: variables,
            operationName: getFromAST_1.getOperationName(query)
        };
        var fetchRequest = {
            options: { query: query, variables: variables },
            queryId: queryId,
            operationName: request.operationName
        };
        var retPromise = new Promise(function (resolve, reject) {
            _this.addFetchQueryPromise(requestId, retPromise, resolve, reject);
            return _this.batcher.enqueueRequest(fetchRequest)
                .then(function (result) {
                // XXX handle multiple ApolloQueryResults
                _this.store.dispatch({
                    type: 'APOLLO_QUERY_RESULT',
                    result: result,
                    queryId: queryId,
                    requestId: requestId
                });
                _this.removeFetchQueryPromise(requestId);
                return result;
            }).then(function () {
                var resultFromStore;
                try {
                    // ensure result is combined with data already in store
                    // this will throw an error if there are missing fields in
                    // the results if returnPartialData is false.
                    resultFromStore = readFromStore_1.readSelectionSetFromStore({
                        store: _this.getApolloState().data,
                        rootId: querySS.id,
                        selectionSet: querySS.selectionSet,
                        variables: variables,
                        returnPartialData: returnPartialData || noFetch,
                        fragmentMap: fragmentMap
                    });
                }
                catch (e) { }
                /* tslint:enable */
                // return a chainable promise
                _this.removeFetchQueryPromise(requestId);
                resolve({ data: resultFromStore, loading: false });
            }).catch(function (error) {
                _this.store.dispatch({
                    type: 'APOLLO_QUERY_ERROR',
                    error: error,
                    queryId: queryId,
                    requestId: requestId
                });
                _this.removeFetchQueryPromise(requestId);
            });
        });
        return retPromise;
    };
    QueryManager.prototype.fetchQueryOverInterface = function (queryId, options, networkInterface) {
        var variables = options.variables, _a = options.forceFetch, forceFetch = _a === void 0 ? false : _a, _b = options.returnPartialData, returnPartialData = _b === void 0 ? false : _b, _c = options.noFetch, noFetch = _c === void 0 ? false : _c;
        var _d = this.transformQueryDocument(options), queryDoc = _d.queryDoc, fragmentMap = _d.fragmentMap;
        var queryDef = getFromAST_1.getQueryDefinition(queryDoc);
        var queryString = printer_1.print(queryDoc);
        var querySS = {
            id: 'ROOT_QUERY',
            typeName: 'Query',
            selectionSet: queryDef.selectionSet
        };
        // If we don't use diffing, then these will be the same as the original query, other than
        // the queryTransformer that could have been applied.
        var minimizedQueryString = queryString;
        var minimizedQuery = querySS;
        var minimizedQueryDoc = queryDoc;
        var storeResult;
        // If this is not a force fetch, we want to diff the query against the
        // store before we fetch it from the network interface.
        if (!forceFetch) {
            var _e = this.handleDiffQuery({
                queryDef: queryDef,
                rootId: querySS.id,
                variables: variables,
                fragmentMap: fragmentMap,
                noFetch: noFetch
            }), diffedQuery = _e.diffedQuery, initialResult = _e.initialResult;
            storeResult = initialResult;
            if (diffedQuery) {
                minimizedQueryDoc = diffedQuery;
                minimizedQueryString = printer_1.print(minimizedQueryDoc);
                minimizedQuery = {
                    id: querySS.id,
                    typeName: 'Query',
                    selectionSet: getFromAST_1.getQueryDefinition(diffedQuery).selectionSet
                };
            }
            else {
                minimizedQueryDoc = null;
                minimizedQueryString = null;
                minimizedQuery = null;
            }
        }
        var requestId = this.generateRequestId();
        // Initialize query in store with unique requestId
        this.store.dispatch({
            type: 'APOLLO_QUERY_INIT',
            queryString: queryString,
            query: querySS,
            minimizedQueryString: minimizedQueryString,
            minimizedQuery: minimizedQuery,
            variables: variables,
            forceFetch: forceFetch,
            returnPartialData: returnPartialData || noFetch,
            queryId: queryId,
            requestId: requestId,
            fragmentMap: fragmentMap
        });
        // If there is no part of the query we need to fetch from the server (or,
        // noFetch is turned on), we just write the store result as the final result.
        if (!minimizedQuery || returnPartialData || noFetch) {
            this.store.dispatch({
                type: 'APOLLO_QUERY_RESULT_CLIENT',
                result: { data: storeResult },
                variables: variables,
                query: querySS,
                complete: !!minimizedQuery,
                queryId: queryId
            });
        }
        if (minimizedQuery && !noFetch) {
            return this.fetchRequest({
                requestId: requestId,
                queryId: queryId,
                query: minimizedQueryDoc,
                querySS: minimizedQuery,
                options: options,
                fragmentMap: fragmentMap,
                networkInterface: networkInterface
            });
        }
        // If we have no query to send to the server, we should return the result
        // found within the store.
        return Promise.resolve({ data: storeResult });
    };
    // Refetches a query given that query's name. Refetches
    // all ObservableQuery instances associated with the query name.
    QueryManager.prototype.refetchQueryByName = function (queryName) {
        var _this = this;
        this.queryIdsByName[queryName].forEach(function (queryId) {
            _this.observableQueries[queryId].observableQuery.refetch();
        });
    };
    // Given a query id and a new result, this checks if the old result is
    // the same as the last result for that particular query id.
    QueryManager.prototype.isDifferentResult = function (queryId, result) {
        return !isEqual(this.queryResults[queryId], result);
    };
    QueryManager.prototype.broadcastQueries = function () {
        var queries = this.getApolloState().queries;
        forOwn(this.queryListeners, function (listener, queryId) {
            // it's possible for the listener to be undefined if the query is being stopped
            // See here for more detail: https://github.com/apollostack/apollo-client/issues/231
            if (listener) {
                var queryStoreValue = queries[queryId];
                listener(queryStoreValue);
            }
        });
    };
    QueryManager.prototype.generateRequestId = function () {
        var requestId = this.idCounter;
        this.idCounter++;
        return requestId;
    };
    return QueryManager;
}());
exports.QueryManager = QueryManager;
