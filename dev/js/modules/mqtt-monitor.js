/* global $ */

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

var OSApp = OSApp || {};
OSApp.MqttMonitor = OSApp.MqttMonitor || {};

// ── Shared background state ───────────────────────────────────────────────────
OSApp.MqttMonitor.messages   = [];   // circular buffer, shared with monitor page
OSApp.MqttMonitor._client    = null;
OSApp.MqttMonitor._state     = "off"; // off | connecting | connected | error
OSApp.MqttMonitor._wsPort    = 9001;
OSApp.MqttMonitor._MAX       = 300;

// ── Background connection ─────────────────────────────────────────────────────
OSApp.MqttMonitor.startBackground = function( wsPort ) {
	if ( wsPort ) { OSApp.MqttMonitor._wsPort = wsPort; }

	// Already connected — nothing to do
	if ( OSApp.MqttMonitor._client && OSApp.MqttMonitor._state === "connected" ) { return; }

	var mqttCfg = OSApp.currentSession.controller &&
	              OSApp.currentSession.controller.settings &&
	              OSApp.currentSession.controller.settings.mqtt;

	if ( !mqttCfg || !mqttCfg.host || typeof mqtt === "undefined" ) { return; }

	// Tear down any stale client
	if ( OSApp.MqttMonitor._client ) {
		try { OSApp.MqttMonitor._client.end( true ); } catch ( e ) {}
		OSApp.MqttMonitor._client = null;
	}

	OSApp.MqttMonitor._state = "connecting";
	$( document ).trigger( "mqttState", [ "connecting" ] );

	var opts = {
		clientId:        "osapp_bg_" + Math.random().toString( 16 ).substr( 2, 8 ),
		reconnectPeriod: 8000,
		connectTimeout:  6000
	};
	if ( mqttCfg.user ) { opts.username = mqttCfg.user; }
	if ( mqttCfg.pass ) { opts.password = mqttCfg.pass; }

	var wsUrl = "ws://" + mqttCfg.host + ":" + OSApp.MqttMonitor._wsPort + "/mqtt";
	var client = mqtt.connect( wsUrl, opts );
	OSApp.MqttMonitor._client = client;

	client.on( "connect", function() {
		client.subscribe( "#" );
		OSApp.MqttMonitor._state = "connected";
		$( document ).trigger( "mqttState", [ "connected" ] );
	} );

	client.on( "message", function( topic, message ) {
		var now     = new Date(),
			hh      = String( now.getHours() ).padStart( 2, "0" ),
			mm      = String( now.getMinutes() ).padStart( 2, "0" ),
			ss      = String( now.getSeconds() ).padStart( 2, "0" ),
			ms      = String( now.getMilliseconds() ).padStart( 3, "0" ),
			pubt    = ( ( mqttCfg.pubt || "opensprinkler" ).replace( /\/+$/, "" ) ),
			subt    = ( ( mqttCfg.subt || "" ).replace( /\/+$/, "" ) ),
			kind    = ( topic === pubt || topic.indexOf( pubt + "/" ) === 0 ) ? "pub" :
			          ( subt && ( topic === subt || topic.indexOf( subt + "/" ) === 0 ) ) ? "sub" : "other",
			payload = message.toString(),
			msg     = { time: hh + ":" + mm + ":" + ss + "." + ms, topic: topic,
			            payload: payload, kind: kind };

		try { msg.payload = JSON.stringify( JSON.parse( payload ), null, 0 ); } catch ( e ) {}

		OSApp.MqttMonitor.messages.push( msg );
		if ( OSApp.MqttMonitor.messages.length > OSApp.MqttMonitor._MAX ) {
			OSApp.MqttMonitor.messages.shift();
		}

		$( document ).trigger( "mqttMessage", [ msg ] );
	} );

	client.on( "error", function() {
		OSApp.MqttMonitor._state = "error";
		$( document ).trigger( "mqttState", [ "error" ] );
	} );

	client.on( "close", function() {
		if ( OSApp.MqttMonitor._state !== "off" ) {
			OSApp.MqttMonitor._state = "connecting"; // will auto-reconnect
			$( document ).trigger( "mqttState", [ "connecting" ] );
		}
	} );
};

OSApp.MqttMonitor.stopBackground = function() {
	OSApp.MqttMonitor._state = "off";
	if ( OSApp.MqttMonitor._client ) {
		try { OSApp.MqttMonitor._client.end( true ); } catch ( e ) {}
		OSApp.MqttMonitor._client = null;
	}
	$( document ).trigger( "mqttState", [ "off" ] );
};

// ── Monitor page ──────────────────────────────────────────────────────────────
OSApp.MqttMonitor.displayPage = function() {
	var mqttCfg = OSApp.currentSession.controller &&
	              OSApp.currentSession.controller.settings &&
	              OSApp.currentSession.controller.settings.mqtt;

	if ( !mqttCfg || !mqttCfg.host ) {
		OSApp.Errors.showError( OSApp.Language._( "MQTT is not configured. Enable it in Options → MQTT first." ) );
		return;
	}

	var paused = false;

	// ── Page skeleton ─────────────────────────────────────────────────────────
	var page = $( [
		"<div data-role='page' id='mqtt-monitor'>",
			"<div class='ui-content' role='main'>",

				"<div class='mqtt-connbar'>",
					"<span class='mqtt-dot mqtt-dot-" + OSApp.MqttMonitor._state + "'></span>",
					"<span class='mqtt-connlabel'>" + OSApp.MqttMonitor._state + "</span>",
					"<span class='mqtt-conninfo'>" + mqttCfg.host + ":" + OSApp.MqttMonitor._wsPort + "</span>",
					"<div class='mqtt-connbar-right'>",
						"<span class='mqtt-count'>" + OSApp.MqttMonitor.messages.length + " messages</span>",
						"<button class='mqtt-btn-pause ui-btn ui-btn-inline ui-mini ui-corner-all'>Pause</button>",
						"<button class='mqtt-btn-clear  ui-btn ui-btn-inline ui-mini ui-corner-all'>Clear</button>",
					"</div>",
				"</div>",

				"<div class='mqtt-portrow'>",
					"<label class='mqtt-portlabel'>WebSocket port</label>",
					"<input class='mqtt-portinput' type='number' value='" + OSApp.MqttMonitor._wsPort + "' min='1' max='65535'>",
					"<button class='mqtt-btn-reconnect ui-btn ui-btn-inline ui-mini ui-corner-all'>Reconnect</button>",
				"</div>",

				"<div class='mqtt-legend'>",
					"<span class='mqtt-pill mqtt-pill-pub'>PUB</span> from controller &nbsp;",
					"<span class='mqtt-pill mqtt-pill-sub'>SUB</span> to controller &nbsp;",
					"<span class='mqtt-pill mqtt-pill-other'>OTHER</span>",
				"</div>",

				"<div class='mqtt-feed' id='mqtt-feed'></div>",
			"</div>",
		"</div>"
	].join( "" ) );

	// ── Header ────────────────────────────────────────────────────────────────
	OSApp.UIDom.changeHeader( {
		title: "MQTT Monitor",
		leftBtn: {
			icon: "carat-l",
			text: OSApp.Language._( "Back" ),
			class: "ui-toolbar-back-btn",
			on: OSApp.UIDom.goBack
		}
	} );

	// ── Helpers ───────────────────────────────────────────────────────────────
	function rowHTML( msg ) {
		return "<div class='mqtt-row mqtt-row-" + msg.kind + "'>" +
			"<span class='mqtt-ts'>" + msg.time + "</span>" +
			"<span class='mqtt-pill mqtt-pill-" + msg.kind + "'>" + msg.kind.toUpperCase() + "</span>" +
			"<span class='mqtt-topic'>" + $( "<span>" ).text( msg.topic ).html() + "</span>" +
			"<span class='mqtt-payload'>" + $( "<span>" ).text( msg.payload ).html() + "</span>" +
		"</div>";
	}

	function appendRow( msg ) {
		if ( paused ) { return; }
		var feed     = document.getElementById( "mqtt-feed" ),
			atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
		feed.insertAdjacentHTML( "beforeend", rowHTML( msg ) );
		while ( feed.children.length > OSApp.MqttMonitor._MAX ) { feed.removeChild( feed.firstChild ); }
		if ( atBottom ) { feed.scrollTop = feed.scrollHeight; }
		page.find( ".mqtt-count" ).text( OSApp.MqttMonitor.messages.length + " messages" );
	}

	function setStatus( state ) {
		var dot = page.find( ".mqtt-dot" );
		dot.removeClass( "mqtt-dot-connecting mqtt-dot-connected mqtt-dot-off mqtt-dot-error" )
		   .addClass( "mqtt-dot-" + state );
		page.find( ".mqtt-connlabel" ).text( state );
	}

	// ── Wire controls ─────────────────────────────────────────────────────────
	page.find( ".mqtt-btn-pause" ).on( "click", function() {
		paused = !paused;
		$( this ).text( paused ? "Resume" : "Pause" );
	} );

	page.find( ".mqtt-btn-clear" ).on( "click", function() {
		OSApp.MqttMonitor.messages = [];
		document.getElementById( "mqtt-feed" ).innerHTML = "";
		page.find( ".mqtt-count" ).text( "0 messages" );
	} );

	page.find( ".mqtt-btn-reconnect" ).on( "click", function() {
		OSApp.MqttMonitor._wsPort = parseInt( page.find( ".mqtt-portinput" ).val(), 10 ) || 9001;
		OSApp.MqttMonitor.stopBackground();
		OSApp.MqttMonitor.messages = [];
		document.getElementById( "mqtt-feed" ).innerHTML = "";
		OSApp.MqttMonitor.startBackground();
	} );

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	page.one( "pageshow", function() {
		// Render buffered messages immediately
		var feed = document.getElementById( "mqtt-feed" );
		OSApp.MqttMonitor.messages.forEach( function( msg ) {
			feed.insertAdjacentHTML( "beforeend", rowHTML( msg ) );
		} );
		feed.scrollTop = feed.scrollHeight;

		// Ensure background connection is running
		OSApp.MqttMonitor.startBackground();

		// Live updates
		$( document ).on( "mqttMessage.monitor", function( e, msg ) { appendRow( msg ); } );
		$( document ).on( "mqttState.monitor",   function( e, s )   { setStatus( s ); } );
	} );

	page.one( "pagehide", function() {
		$( document ).off( "mqttMessage.monitor mqttState.monitor" );
		page.remove();
	} );

	$.mobile.pageContainer.append( page );
	$.mobile.changePage( page, { changeHash: false } );
};
