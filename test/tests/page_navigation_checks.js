/* eslint-disable */

/* OpenSprinkler App
 * Copyright (C) 2015 - present, Samer Albahra. All rights reserved.
 *
 * This file is part of the OpenSprinkler project <http://opensprinkler.com>.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

describe("Page Navigation Checks", function () {
	before(function () {
		OSApp.currentSession.ip = "demo.opensprinkler.com";
		OSApp.currentSession.pass = "opendoor";
		OSApp.currentSession.prefix = "https://";
		OSApp.currentSession.fw183 = false;

		OSApp.Sites.updateSiteList(["Test"], "Test");
	});

	it("Start jQuery Mobile Page Initialization", function (done) {
		$.mobile.document.one("pageshow", "#sprinklers", function () {
			done();
		});

		OSApp.Sites.newLoad();
	});

	it( "Change page to program preview", function( done ) {
		$.mobile.document.one( "pageshow", "#preview", function() {
			done();
		} );
		OSApp.UIDom.showHomeMenu();
		var previewLink = $( "#mainMenu" ).find( "a[data-target='#preview']" ),
			clickEvent = $.Event( "click" );

		assert.equal( previewLink.length, 1, "program preview menu tile should exist" );
		previewLink.trigger( clickEvent );
		assert.isTrue( clickEvent.isDefaultPrevented(), "menu tile should suppress browser hash navigation" );
	} );

	it( "Change to logs page", function( done ) {
		$.mobile.document.one( "pageshow", "#logs", function() {
			done();
		} );
		assert.doesNotThrow( function() {
			OSApp.UIDom.changePage( "#logs" );
		} );
	} );

	it( "Change to runonce page", function( done ) {
		$.mobile.document.one( "pageshow", "#runonce", function() {
			done();
		} );
		assert.doesNotThrow( function() {
			OSApp.UIDom.changePage( "#runonce" );
		} );
	} );

	it( "Run-once page exposes per-station durations and starts instead of saving", function() {
		var originalIsDisabled = OSApp.Stations.isDisabled,
			originalShowDurationBox = OSApp.UIDom.showDurationBox,
			stationsPage;

		try {
			OSApp.Stations.isDisabled = function() { return true; };
			OSApp.Programs.displayPageRunOnce();
			stationsPage = $( "#runonce" );

			assert.lengthOf( stationsPage.find( "button[id^='zone-']" ), OSApp.currentSession.controller.stations.snames.length, "all station duration controls should be rendered" );
			assert.lengthOf( stationsPage.find( ".runonce-station-disabled" ), OSApp.currentSession.controller.stations.snames.length, "disabled stations should stay visible and be marked" );
			assert.notEqual( stationsPage.find( "#zone-1" ).parent().attr( "style" ), "display:none", "disabled rows must not be hidden by the global filter" );
			assert.include( stationsPage.find( "label[for='rprog']" ).text(), OSApp.Language._( "Run-once preset label" ) );
			assert.equal( stationsPage.find( ".rsubmit" ).text(), OSApp.Language._( "Run" ), "the action should be labeled as starting the run-once program" );

			OSApp.UIDom.showDurationBox = function( options ) {
				options.callback( 180 );
			};
			stationsPage.find( "#zone-1" ).trigger( "click" );
			assert.equal( stationsPage.find( "#zone-1" ).val(), 180, "tapping a station should update its individual duration" );
		} finally {
			OSApp.Stations.isDisabled = originalIsDisabled;
			OSApp.UIDom.showDurationBox = originalShowDurationBox;
		}
	} );

	it( "Change to edit programs page", function( done ) {
		$.mobile.document.one( "pageshow", "#programs", function() {
			done();
		} );
		assert.doesNotThrow( function() {
			OSApp.UIDom.changePage( "#programs" );
		} );
	} );

	it( "Program editor shows disabled station durations and explains additional starts", function() {
		var controller = OSApp.currentSession.controller,
			originalPrograms = controller.programs,
			originalFirmware = controller.options.fwv,
			originalIsDisabled = OSApp.Stations.isDisabled,
			programsPage = $( "#programs" ),
			wasShowingDisabled = programsPage.hasClass( "show-hidden" ),
			editor;

		try {
			controller.options.fwv = 210;
			OSApp.Stations.isDisabled = function() { return true; };
			controller.programs = $.extend( {}, originalPrograms, {
				nprogs: 1,
				pd: [ [ 1, 127, 0, [ 360, 0, 0 ], [ 600, 300, 0, 0, 0, 0, 0, 0 ], "Program editor test" ] ]
			} );
			programsPage.removeClass( "show-hidden" );

			editor = OSApp.Programs.makeProgram21( 0 );

			assert.lengthOf( editor.find( "button[id^='station_']" ), 8, "all station duration controls should be rendered" );
			assert.lengthOf( editor.find( ".program-station-disabled" ), 8, "disabled stations should remain visible and marked" );
			assert.notEqual( editor.find( "#station_0-0" ).parent().attr( "style" ), "display:none", "station duration must not be hidden by the global filter" );
			assert.include( editor.find( "#station-head" ).text(), "00:00:00", "disabled durations should not inflate the effective program runtime" );
			assert.isTrue( editor.find( ".program-station-help" ).length === 1, "duration instructions should be present" );
			assert.isTrue( editor.find( ".program-start-times-help" ).length === 1, "additional starts should be explained as part of this program" );
			assert.include( editor.find( "#set-all" ).text(), "Set All Station Durations" );
		} finally {
			controller.programs = originalPrograms;
			controller.options.fwv = originalFirmware;
			OSApp.Stations.isDisabled = originalIsDisabled;
			programsPage.toggleClass( "show-hidden", wasShowingDisabled );
		}
	} );

	it( "Change to add new program page", function( done ) {
		$.mobile.document.one( "pageshow", "#addprogram", function() {
			done();
		} );
		assert.doesNotThrow( function() {
			OSApp.UIDom.changePage( "#addprogram" );
		} );
	} );

	it( "Change to options page", function( done ) {
		$.mobile.document.one( "pageshow", "#os-options", function() {
			done();
		} );
		assert.doesNotThrow( function() {
			OSApp.UIDom.changePage( "#os-options" );
		} );
	} );

	it( "Change to site manager page", function( done ) {
		$.mobile.document.one( "pageshow", "#site-control", function() {
			done();
		} );
		assert.doesNotThrow( function() {
			OSApp.UIDom.changePage( "#site-control" );
		} );
	} );

	it( "Change to about page", function( done ) {
		$.mobile.document.one( "pageshow", "#about", function() {
			done();
		} );
		assert.doesNotThrow( function() {
			OSApp.UIDom.changePage( "#about" );
		} );
	} );
});
