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

OSApp.MqttMonitor.displayPage = function() {
	var mqttCfg  = OSApp.currentSession.controller &&
	               OSApp.currentSession.controller.settings &&
	               OSApp.currentSession.controller.settings.mqtt;

	if ( !mqttCfg || !mqttCfg.host ) {
		OSApp.Errors.showError( OSApp.Language._( "MQTT is not configured. Enable it in Options → MQTT first." ) );
		return;
	}

	var MAX_MSGS  = 300,
		messages  = [],
		client    = null,
		paused    = false,
		pubt      = ( mqttCfg.pubt || "opensprinkler" ).replace( /\/+$/, "" ),
		subt      = ( mqttCfg.subt || "" ).replace( /\/+$/, "" );

	// ── Page skeleton ──────────────────────────────────────────────────────
	var page = $( [
		"<div data-role='page' id='mqtt-monitor'>",
			"<div class='ui-content' role='main'>",

				// Connection bar
				"<div class='mqtt-connbar'>",
					"<span class='mqtt-dot mqtt-dot-connecting'></span>",
					"<span class='mqtt-connlabel'>Connecting…</span>",
					"<span class='mqtt-conninfo'></span>",
					"<div class='mqtt-connbar-right'>",
						"<span class='mqtt-count'>0 messages</span>",
						"<button class='mqtt-btn-pause ui-btn ui-btn-inline ui-mini ui-corner-all'>Pause</button>",
						"<button class='mqtt-btn-clear  ui-btn ui-btn-inline ui-mini ui-corner-all'>Clear</button>",
					"</div>",
				"</div>",

				// WS port row
				"<div class='mqtt-portrow'>",
					"<label class='mqtt-portlabel'>WebSocket port</label>",
					"<input class='mqtt-portinput' type='number' value='9001' min='1' max='65535'>",
					"<button class='mqtt-btn-reconnect ui-btn ui-btn-inline ui-mini ui-corner-all'>Reconnect</button>",
				"</div>",

				// Legend
				"<div class='mqtt-legend'>",
					"<span class='mqtt-pill mqtt-pill-pub'>PUB</span> from controller &nbsp;",
					"<span class='mqtt-pill mqtt-pill-sub'>SUB</span> to controller &nbsp;",
					"<span class='mqtt-pill mqtt-pill-other'>OTHER</span>",
				"</div>",

				// Message feed
				"<div class='mqtt-feed' id='mqtt-feed'></div>",

			"</div>",
		"</div>"
	].join( "" ) );

	// ── Header ──────────────────────────────────────────────────────────────
	OSApp.UIDom.changeHeader( {
		title: "MQTT Monitor",
		leftBtn: {
			icon: "carat-l",
			text: OSApp.Language._( "Back" ),
			class: "ui-toolbar-back-btn",
			on: OSApp.UIDom.goBack
		}
	} );

	// ── Helper: classify topic ───────────────────────────────────────────────
	function classify( topic ) {
		if ( pubt && topic === pubt || topic.indexOf( pubt + "/" ) === 0 ) { return "pub"; }
		if ( subt && topic === subt || ( subt && topic.indexOf( subt + "/" ) === 0 ) ) { return "sub"; }
		return "other";
	}

	// ── Helper: format payload ───────────────────────────────────────────────
	function formatPayload( raw ) {
		try {
			var obj = JSON.parse( raw );
			return JSON.stringify( obj, null, 0 );   // compact but valid JSON
		} catch ( e ) {
			return raw;
		}
	}

	// ── Render one message row ───────────────────────────────────────────────
	function rowHTML( msg ) {
		var cls  = "mqtt-row mqtt-row-" + msg.kind,
			pill = "<span class='mqtt-pill mqtt-pill-" + msg.kind + "'>" +
			       msg.kind.toUpperCase() + "</span>";
		return "<div class='" + cls + "'>" +
			"<span class='mqtt-ts'>" + msg.time + "</span>" +
			pill +
			"<span class='mqtt-topic'>" + $( "<span>" ).text( msg.topic ).html() + "</span>" +
			"<span class='mqtt-payload'>" + $( "<span>" ).text( msg.payload ).html() + "</span>" +
		"</div>";
	}

	// ── Add message ──────────────────────────────────────────────────────────
	function addMessage( topic, payloadBuf ) {
		if ( paused ) { return; }

		var now     = new Date(),
			hh      = String( now.getHours() ).padStart( 2, "0" ),
			mm      = String( now.getMinutes() ).padStart( 2, "0" ),
			ss      = String( now.getSeconds() ).padStart( 2, "0" ),
			ms      = String( now.getMilliseconds() ).padStart( 3, "0" ),
			payload = formatPayload( payloadBuf.toString() ),
			msg     = { time: hh + ":" + mm + ":" + ss + "." + ms, topic: topic,
			            payload: payload, kind: classify( topic ) };

		messages.push( msg );
		if ( messages.length > MAX_MSGS ) { messages.shift(); }

		var feed     = document.getElementById( "mqtt-feed" ),
			atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;

		feed.insertAdjacentHTML( "beforeend", rowHTML( msg ) );

		// Trim DOM to MAX_MSGS rows
		while ( feed.children.length > MAX_MSGS ) {
			feed.removeChild( feed.firstChild );
		}

		// Auto-scroll if already at bottom
		if ( atBottom ) { feed.scrollTop = feed.scrollHeight; }

		// Update counter
		page.find( ".mqtt-count" ).text( messages.length + " messages" );
	}

	// ── Connect ──────────────────────────────────────────────────────────────
	function connect() {
		var wsPort  = parseInt( page.find( ".mqtt-portinput" ).val(), 10 ) || 9001,
			wsUrl   = "ws://" + mqttCfg.host + ":" + wsPort + "/mqtt",
			opts    = {
				clientId:        "osapp_" + Math.random().toString( 16 ).substr( 2, 8 ),
				reconnectPeriod: 0,    // no auto-reconnect; user controls it
				connectTimeout:  6000
			};

		if ( mqttCfg.user )     { opts.username = mqttCfg.user; }
		if ( mqttCfg.pass )     { opts.password = mqttCfg.pass; }

		setStatus( "connecting", "Connecting to " + wsUrl + " …", "" );

		if ( typeof mqtt === "undefined" ) {
			OSApp.Errors.showError( "mqtt.js failed to load" );
			setStatus( "error", "Library error", "" );
			return;
		}

		if ( client ) { try { client.end( true ); } catch ( e ) {} }

		client = mqtt.connect( wsUrl, opts );

		client.on( "connect", function() {
			client.subscribe( "#" );   // all topics
			setStatus( "connected", "Connected", mqttCfg.host + ":" + wsPort );
		} );

		client.on( "message", function( topic, message ) {
			addMessage( topic, message );
		} );

		client.on( "error", function( err ) {
			setStatus( "error", "Error: " + ( err.message || err ), "" );
		} );

		client.on( "close", function() {
			setStatus( "offline", "Disconnected", "" );
		} );

		client.on( "offline", function() {
			setStatus( "offline", "Offline", "" );
		} );
	}

	// ── Status indicator ─────────────────────────────────────────────────────
	function setStatus( state, label, info ) {
		var dot = page.find( ".mqtt-dot" );
		dot.removeClass( "mqtt-dot-connecting mqtt-dot-connected mqtt-dot-offline mqtt-dot-error" )
		   .addClass( "mqtt-dot-" + state );
		page.find( ".mqtt-connlabel" ).text( label );
		page.find( ".mqtt-conninfo" ).text( info );
	}

	// ── Wire up controls ─────────────────────────────────────────────────────
	page.find( ".mqtt-btn-pause" ).on( "click", function() {
		paused = !paused;
		$( this ).text( paused ? "Resume" : "Pause" );
	} );

	page.find( ".mqtt-btn-clear" ).on( "click", function() {
		messages = [];
		document.getElementById( "mqtt-feed" ).innerHTML = "";
		page.find( ".mqtt-count" ).text( "0 messages" );
	} );

	page.find( ".mqtt-btn-reconnect" ).on( "click", function() {
		page.find( "#mqtt-feed" ).html( "" );
		messages = [];
		connect();
	} );

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	page.one( "pageshow", function() {
		connect();
	} );

	page.one( "pagehide", function() {
		if ( client ) {
			try { client.end( true ); } catch ( e ) {}
			client = null;
		}
		page.remove();
	} );

	$.mobile.pageContainer.append( page );
	$.mobile.changePage( page, { changeHash: false } );
};
