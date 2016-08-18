"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var ApolloError = (function (_super) {
    __extends(ApolloError, _super);
    // Constructs an instance of ApolloError given a GraphQLError
    // or a network error. Note that one of these has to be a valid
    // value or the constructed error will be meaningless.
    function ApolloError(_a) {
        var graphQLErrors = _a.graphQLErrors, networkError = _a.networkError, errorMessage = _a.errorMessage, extraInfo = _a.extraInfo;
        _super.call(this, errorMessage);
        this.graphQLErrors = graphQLErrors;
        this.networkError = networkError;
        // set up the stack trace
        this.stack = new Error().stack;
        if (!errorMessage) {
            this.generateErrorMessage();
        }
        else {
            this.message = errorMessage;
        }
        this.extraInfo = extraInfo;
    }
    // Sets the error message on this error according to the
    // the GraphQL and network errors that are present.
    // If the error message has already been set through the
    // constructor or otherwise, this function is a nop.
    ApolloError.prototype.generateErrorMessage = function () {
        if (typeof this.message !== 'undefined' &&
            this.message !== '') {
            return;
        }
        var message = '';
        // If we have GraphQL errors present, add that to the error message.
        if (Array.isArray(this.graphQLErrors) && this.graphQLErrors.length !== 0) {
            this.graphQLErrors.forEach(function (graphQLError) {
                message += 'GraphQL error: ' + graphQLError.message + '\n';
            });
        }
        if (this.networkError) {
            message += 'Network error: ' + this.networkError.message + '\n';
        }
        // strip newline from the end of the message
        message = message.replace(/\n$/, '');
        this.message = message;
    };
    return ApolloError;
}(Error));
exports.ApolloError = ApolloError;
