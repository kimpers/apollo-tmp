// This simplified polyfill attempts to follow the ECMAScript Observable proposal.
// See https://github.com/zenparsing/es-observable
"use strict";
var $$observable = require('symbol-observable');
function isSubscription(subscription) {
    return subscription.unsubscribe !== undefined;
}
var Observable = (function () {
    function Observable(subscriberFunction) {
        this.subscriberFunction = subscriberFunction;
    }
    Observable.prototype[$$observable] = function () {
        return this;
    };
    Observable.prototype.subscribe = function (observer) {
        var subscriptionOrCleanupFunction = this.subscriberFunction(observer);
        if (isSubscription(subscriptionOrCleanupFunction)) {
            return subscriptionOrCleanupFunction;
        }
        else {
            return {
                unsubscribe: subscriptionOrCleanupFunction
            };
        }
    };
    return Observable;
}());
exports.Observable = Observable;
