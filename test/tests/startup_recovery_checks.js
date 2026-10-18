/* eslint-disable */

describe( "Startup Recovery Checks", function() {
	it( "preserves the local site and leaves the loading page after a connection timeout", function() {
		var originalLocal = OSApp.currentSession.local,
			originalController = OSApp.currentSession.controller,
			originalTimers = OSApp.uiState.timers,
			originalUpdateController = OSApp.Sites.updateController,
			originalClearNotifications = OSApp.Notifications.clearNotifications,
			originalRemove = OSApp.Storage.remove,
			originalChangePage = OSApp.UIDom.changePage,
			originalShowError = OSApp.Errors.showError,
			originalAbort = $.ajaxq.abort,
			originalDocumentOne = $.mobile.document.one,
			pageShowCallback,
			removedSites = false,
			changedPage = false,
			showedError = false;

		try {
			OSApp.currentSession.local = true;
			OSApp.currentSession.controller = {};
			OSApp.uiState.timers = {};
			OSApp.Sites.updateController = function( success, fail ) {
				fail( { statusText: "timeout" } );
			};
			OSApp.Notifications.clearNotifications = function() {};
			OSApp.Storage.remove = function( keys ) {
				if ( keys.indexOf( "sites" ) !== -1 ) {
					removedSites = true;
				}
			};
			OSApp.UIDom.changePage = function( page ) {
				changedPage = page === "#site-control";
			};
			OSApp.Errors.showError = function() {
				showedError = true;
			};
			$.ajaxq.abort = function() {};
			$.mobile.document.one = function( event, selector, callback ) {
				if ( event === "pageshow" && typeof selector === "function" ) {
					pageShowCallback = selector;
					return this;
				}

				return originalDocumentOne.apply( this, arguments );
			};

			OSApp.Sites.newLoad();

			if ( pageShowCallback ) {
				pageShowCallback();
			}

			assert.isFalse( removedSites, "a connection failure must not erase the saved local site" );
			assert.isTrue( changedPage || showedError, "the user should be taken to site management or shown an error" );
		} finally {
			OSApp.currentSession.local = originalLocal;
			OSApp.currentSession.controller = originalController;
			OSApp.uiState.timers = originalTimers;
			OSApp.Sites.updateController = originalUpdateController;
			OSApp.Notifications.clearNotifications = originalClearNotifications;
			OSApp.Storage.remove = originalRemove;
			OSApp.UIDom.changePage = originalChangePage;
			OSApp.Errors.showError = originalShowError;
			$.ajaxq.abort = originalAbort;
			$.mobile.document.one = originalDocumentOne;
		}
	} );
} );
