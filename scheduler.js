// The QueryScheduler is supposed to be a mechanism that schedules polling queries such that
// they are clustered into the time slots of the QueryBatcher and are batched together. It
// also makes sure that for a given polling query, if one instance of the query is inflight,
// another instance will not be fired until the query returns or times out. We do this because
// another query fires while one is already in flight, the data will stay in the "loading" state
// even after the first query has returned.
"use strict";
var ObservableQuery_1 = require('./ObservableQuery');
var assign = require('lodash.assign');
var QueryScheduler = (function () {
    function QueryScheduler(_a) {
        var queryManager = _a.queryManager;
        this.queryManager = queryManager;
        this.pollingTimers = {};
        this.inFlightQueries = {};
        this.registeredQueries = {};
        this.intervalQueries = {};
    }
    QueryScheduler.prototype.checkInFlight = function (queryId) {
        return this.inFlightQueries.hasOwnProperty(queryId);
    };
    QueryScheduler.prototype.fetchQuery = function (queryId, options) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this.queryManager.fetchQuery(queryId, options).then(function (result) {
                _this.removeInFlight(queryId);
                resolve(result);
            }).catch(function (error) {
                _this.removeInFlight(queryId);
                reject(error);
            });
            _this.addInFlight(queryId, options);
        });
    };
    // The firstFetch option is used to denote whether we want to fire off a
    // "first fetch" before we start polling. If startPollingQuery() is being called
    // from an existing ObservableQuery, the first fetch has already been fired which
    // means that firstFetch should be false.
    QueryScheduler.prototype.startPollingQuery = function (options, queryId, firstFetch, listener) {
        if (firstFetch === void 0) { firstFetch = true; }
        if (!options.pollInterval) {
            throw new Error('Attempted to start a polling query without a polling interval.');
        }
        this.registeredQueries[queryId] = options;
        // Fire an initial fetch before we start the polling query
        if (firstFetch) {
            this.fetchQuery(queryId, options);
        }
        if (listener) {
            this.queryManager.addQueryListener(queryId, listener);
        }
        this.addQueryOnInterval(queryId, options);
        return queryId;
    };
    QueryScheduler.prototype.stopPollingQuery = function (queryId) {
        // Remove the query options from one of the registered queries.
        // The polling function will then take care of not firing it anymore.
        delete this.registeredQueries[queryId];
    };
    // Fires the all of the queries on a particular interval. Called on a setInterval.
    QueryScheduler.prototype.fetchQueriesOnInterval = function (interval) {
        var _this = this;
        this.intervalQueries[interval] = this.intervalQueries[interval].filter(function (queryId) {
            // If queryOptions can't be found from registeredQueries, it means that this queryId
            // is no longer registered and should be removed from the list of queries firing on this
            // interval.
            if (!_this.registeredQueries.hasOwnProperty(queryId)) {
                return false;
            }
            // Don't fire this instance of the polling query is one of the instances is already in
            // flight.
            if (_this.checkInFlight(queryId)) {
                return true;
            }
            var queryOptions = _this.registeredQueries[queryId];
            var pollingOptions = assign({}, queryOptions);
            pollingOptions.forceFetch = true;
            _this.fetchQuery(queryId, pollingOptions);
            return true;
        });
        if (this.intervalQueries[interval].length === 0) {
            clearInterval(this.pollingTimers[interval]);
        }
    };
    // Adds a query on a particular interval to this.intervalQueries and then fires
    // that query with all the other queries executing on that interval. Note that the query id
    // and query options must have been added to this.registeredQueries before this function is called.
    QueryScheduler.prototype.addQueryOnInterval = function (queryId, queryOptions) {
        var _this = this;
        var interval = queryOptions.pollInterval;
        // If there are other queries on this interval, this query will just fire with those
        // and we don't need to create a new timer.
        if (this.intervalQueries.hasOwnProperty(interval.toString())) {
            this.intervalQueries[interval].push(queryId);
        }
        else {
            this.intervalQueries[interval] = [queryId];
            // set up the timer for the function that will handle this interval
            this.pollingTimers[interval] = setInterval(function () {
                _this.fetchQueriesOnInterval(interval);
            }, interval);
        }
    };
    // Used only for unit testing.
    QueryScheduler.prototype.registerPollingQuery = function (queryOptions) {
        if (!queryOptions.pollInterval) {
            throw new Error('Attempted to register a non-polling query with the scheduler.');
        }
        return new ObservableQuery_1.ObservableQuery({
            scheduler: this,
            options: queryOptions
        });
    };
    QueryScheduler.prototype.addInFlight = function (queryId, options) {
        this.inFlightQueries[queryId] = options;
    };
    QueryScheduler.prototype.removeInFlight = function (queryId) {
        delete this.inFlightQueries[queryId];
    };
    return QueryScheduler;
}());
exports.QueryScheduler = QueryScheduler;
