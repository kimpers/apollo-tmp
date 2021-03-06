"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Observable_1 = require('./util/Observable');
var errorHandling_1 = require('./util/errorHandling');
var assign = require('lodash.assign');
var ObservableQuery = (function (_super) {
    __extends(ObservableQuery, _super);
    function ObservableQuery(_a) {
        var _this = this;
        var scheduler = _a.scheduler, options = _a.options, _b = _a.shouldSubscribe, shouldSubscribe = _b === void 0 ? true : _b;
        var queryManager = scheduler.queryManager;
        var queryId = queryManager.generateQueryId();
        var isPollingQuery = !!options.pollInterval;
        var subscriberFunction = function (observer) {
            var retQuerySubscription = {
                unsubscribe: function () {
                    if (isPollingQuery) {
                        scheduler.stopPollingQuery(queryId);
                    }
                    queryManager.stopQuery(queryId);
                }
            };
            if (shouldSubscribe) {
                queryManager.addObservableQuery(queryId, _this);
                queryManager.addQuerySubscription(queryId, retQuerySubscription);
            }
            if (isPollingQuery) {
                if (options.noFetch) {
                    throw new Error('noFetch option should not use query polling.');
                }
                _this.scheduler.startPollingQuery(options, queryId);
            }
            queryManager.startQuery(queryId, options, queryManager.queryListenerForObserver(queryId, options, observer));
            return retQuerySubscription;
        };
        _super.call(this, subscriberFunction);
        this.options = options;
        this.scheduler = scheduler;
        this.queryManager = queryManager;
        this.queryId = queryId;
        this.refetch = function (variables) {
            // Extend variables if available
            variables = variables || _this.options.variables ?
                assign({}, _this.options.variables, variables) : undefined;
            if (_this.options.noFetch) {
                throw new Error('noFetch option should not use query refetch.');
            }
            // Use the same options as before, but with new variables and forceFetch true
            return _this.queryManager.fetchQuery(_this.queryId, assign(_this.options, {
                forceFetch: true,
                variables: variables
            }));
        };
        this.fetchMore = function (fetchMoreOptions) {
            return Promise.resolve()
                .then(function () {
                var qid = _this.queryManager.generateQueryId();
                var combinedOptions = null;
                if (fetchMoreOptions.query) {
                    // fetch a new query
                    combinedOptions = fetchMoreOptions;
                }
                else {
                    // fetch the same query with a possibly new variables
                    var variables = _this.options.variables || fetchMoreOptions.variables ?
                        assign({}, _this.options.variables, fetchMoreOptions.variables) : undefined;
                    combinedOptions = assign({}, _this.options, fetchMoreOptions, {
                        variables: variables
                    });
                }
                combinedOptions = assign({}, combinedOptions, {
                    forceFetch: true
                });
                return _this.queryManager.fetchQuery(qid, combinedOptions);
            })
                .then(function (fetchMoreResult) {
                var reducer = fetchMoreOptions.updateQuery;
                var mapFn = function (previousResult, _a) {
                    var queryVariables = _a.queryVariables;
                    return reducer(previousResult, {
                        fetchMoreResult: fetchMoreResult,
                        queryVariables: queryVariables
                    });
                };
                _this.updateQuery(mapFn);
            });
        };
        this.updateQuery = function (mapFn) {
            var _a = _this.queryManager.getQueryWithPreviousResult(_this.queryId), previousResult = _a.previousResult, queryVariables = _a.queryVariables, querySelectionSet = _a.querySelectionSet, _b = _a.queryFragments, queryFragments = _b === void 0 ? [] : _b;
            var newResult = errorHandling_1.tryFunctionOrLogError(function () { return mapFn(previousResult, { queryVariables: queryVariables }); });
            if (newResult) {
                _this.queryManager.store.dispatch({
                    type: 'APOLLO_UPDATE_QUERY_RESULT',
                    newResult: newResult,
                    queryVariables: queryVariables,
                    querySelectionSet: querySelectionSet,
                    queryFragments: queryFragments
                });
            }
        };
        this.stopPolling = function () {
            _this.queryManager.stopQuery(_this.queryId);
            if (isPollingQuery) {
                _this.scheduler.stopPollingQuery(_this.queryId);
            }
        };
        this.startPolling = function (pollInterval) {
            if (_this.options.noFetch) {
                throw new Error('noFetch option should not use query polling.');
            }
            if (isPollingQuery) {
                _this.scheduler.stopPollingQuery(_this.queryId);
            }
            options.pollInterval = pollInterval;
            _this.scheduler.startPollingQuery(_this.options, _this.queryId, false);
        };
    }
    ObservableQuery.prototype.result = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var subscription = _this.subscribe({
                next: function (result) {
                    resolve(result);
                    setTimeout(function () {
                        subscription.unsubscribe();
                    }, 0);
                },
                error: function (error) {
                    reject(error);
                }
            });
        });
    };
    return ObservableQuery;
}(Observable_1.Observable));
exports.ObservableQuery = ObservableQuery;
