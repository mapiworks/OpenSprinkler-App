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

// Configure module
var OSApp = OSApp || {};
OSApp.Dashboard = OSApp.Dashboard || {};

OSApp.Dashboard.displayPage = function() {
	// Display the home dasbhoard main view
	var cards, siteSelect, currentSite, i, sites,
		lastRunByStation = {},
		stationInitialRem = {};

	// Fetch recent log entries and build a per-station last-run map
	function fetchLastRun() {
		var now = Math.floor( Date.now() / 1000 );
		var start = now - ( 30 * 86400 ); // last 30 days
		OSApp.Firmware.sendToOS( "/jl?pw=&start=" + start + "&end=" + now, "json" ).done( function( data ) {
			if ( !Array.isArray( data ) ) { return; }
			lastRunByStation = {};
			data.forEach( function( entry ) {
				var sid = entry[ 1 ];
				var endTime = entry[ 3 ];
				// Keep the most recent run per station
				if ( typeof sid === "number" && ( !lastRunByStation[ sid ] || endTime > lastRunByStation[ sid ] ) ) {
					lastRunByStation[ sid ] = endTime;
				}
			} );
			// Re-render last-run labels in all idle cards
			page.find( ".station-last-run" ).each( function() {
				var card = $( this ).closest( ".card" );
				var sid = OSApp.Cards.getSID( card );
				if ( sid !== undefined && lastRunByStation[ sid ] ) {
					$( this ).text( formatLastRun( lastRunByStation[ sid ] ) );
				} else {
					$( this ).remove();
				}
			} );
		} );
	}

	// Format a Unix timestamp as a human-friendly last-run string
	function formatLastRun( ts ) {
		if ( !ts ) { return ""; }
		var d = new Date( ts * 1000 );
		var now = new Date();
		var diffMs = now - d;
		var diffMins = Math.floor( diffMs / 60000 );
		if ( diffMins < 60 ) {
			return OSApp.Language._( "Last run" ) + ": " + diffMins + " min ago";
		}
		var diffHours = Math.floor( diffMins / 60 );
		if ( diffHours < 24 ) {
			return OSApp.Language._( "Last run" ) + ": " + diffHours + " h ago";
		}
		var diffDays = Math.floor( diffHours / 24 );
		if ( diffDays === 1 ) {
			return OSApp.Language._( "Last run" ) + ": yesterday";
		}
		if ( diffDays < 14 ) {
			return OSApp.Language._( "Last run" ) + ": " + diffDays + " days ago";
		}
		return OSApp.Language._( "Last run" ) + ": " + OSApp.Dates.dateToString( d );
	}

	// Calculate progress percentage for a running station (0-100).
	// Tries multiple sources in priority order so progress works for both
	// scheduled program runs and manual runs.
	function getRunProgress( sid ) {
		var rem = OSApp.Stations.getRemainingRuntime( sid );
		if ( rem <= 0 ) { return 0; }

		// Source 1: Firmware start timestamp — most accurate, but 0 for manual
		// runs on firmware 2.4.0.
		var startTime = OSApp.Stations.getStartTime( sid );
		if ( startTime > 0 ) {
			var nowSec = Math.floor( Date.now() / 1000 );
			var elapsed = Math.max( 0, nowSec - startTime );
			var total = elapsed + rem;
			return total > 0 ? Math.min( 100, Math.round( elapsed / total * 100 ) ) : 0;
		}

		// Source 2: Program duration table — works when a scheduled program is
		// running (PID is a real program index, not 99/255 manual or 98/254 run-once).
		var pid = OSApp.Stations.getPID( sid );
		if ( pid > 0 && pid !== 99 && pid !== 255 && pid !== 98 && pid !== 254 ) {
			var pd = OSApp.currentSession.controller.programs && OSApp.currentSession.controller.programs.pd;
			if ( pd && pd[ pid - 1 ] && pd[ pid - 1 ][ 4 ] ) {
				var rawDur = pd[ pid - 1 ][ 4 ][ sid ];
				var progTotal = OSApp.Stations.getStationDuration( rawDur );
				if ( progTotal > 0 ) {
					var progElapsed = Math.max( 0, progTotal - rem );
					return Math.min( 100, Math.round( progElapsed / progTotal * 100 ) );
				}
			}
		}

		// Source 3: Duration saved in local storage from the last manual run
		// of this station (set when the user taps a station and enters a duration).
		if ( sites && currentSite && sites[ currentSite ] && sites[ currentSite ].lastRunTime ) {
			var savedDur = sites[ currentSite ].lastRunTime[ sid ];
			if ( savedDur > 0 ) {
				var savedElapsed = Math.max( 0, savedDur - rem );
				return Math.min( 100, Math.round( savedElapsed / savedDur * 100 ) );
			}
		}

		// No valid source — caller should not show a progress ring.
		return -1;
	}

	// Returns true when a circular progress ring should be shown for this station.
	// Manual PIDs (99/255) and run-once PIDs (98/254) don't show a ring even when
	// Source 3 is available, because the user expects them to show only remaining time.
	function canShowRing( sid ) {
		var pid = OSApp.Stations.getPID( sid );
		if ( pid === 99 || pid === 255 || pid === 98 || pid === 254 ) { return false; }
		return getRunProgress( sid ) >= 0;
	}

	// Compact HH:MM or M:SS label used inside the progress ring.
	function compactTime( sec ) {
		var h = Math.floor( sec / 3600 );
		var m = Math.floor( ( sec % 3600 ) / 60 );
		var s = sec % 60;
		if ( h > 0 ) {
			return h + ":" + ( m < 10 ? "0" : "" ) + m;
		}
		return m + ":" + ( s < 10 ? "0" : "" ) + s;
	}

	// Actual remaining seconds for a running station, accounting for elapsed time
	// since the firmware start timestamp. More accurate than the raw rem value
	// when the page is loaded mid-run.
	function getActualRemaining( sid ) {
		var startTime = OSApp.Stations.getStartTime( sid );
		var rem = OSApp.Stations.getRemainingRuntime( sid );
		if ( !startTime || startTime <= 0 ) { return rem; }
		var nowSec = Math.floor( Date.now() / 1000 );
		var elapsed = Math.max( 0, nowSec - startTime );
		var total = rem + elapsed; // total = original duration
		return Math.max( 0, total - elapsed );
	}
	// ── HomeKit tile constants ──────────────────────────────────────────────
	var RING_R    = 22;
	var RING_CIRC = parseFloat( ( 2 * Math.PI * RING_R ).toFixed( 2 ) ); // 138.23

	// Feather-style SVG icons (stroke-based, currentColor)
	var ICON_HAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="M18 11V6a2 2 0 0 0-4 0v5"/>' +
		'<path d="M14 10V4a2 2 0 0 0-4 0v6"/>' +
		'<path d="M10 10.5V6a2 2 0 0 0-4 0v8"/>' +
		'<path d="M6 14a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-2.5"/></svg>';

	var ICON_CAL  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
		'<line x1="16" y1="2" x2="16" y2="6"/>' +
		'<line x1="8" y1="2" x2="8" y2="6"/>' +
		'<line x1="3" y1="10" x2="21" y2="10"/></svg>';

	var ICON_DROP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>';

	var ICON_GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<circle cx="12" cy="12" r="3"/>' +
		'<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

	var ICON_GAUGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="M4.5 16.5a8 8 0 1 1 15 0"/>' +
		'<path d="M12 8l2.5 4.5"/></svg>';

	// Renders HomeKit-style sensor tiles for all sensors with show===true.
	// Replaces the plain-label updateSensorShowArea call on the dashboard.
	function renderSensorTiles( page ) {
		var showArea = page.find( "#os-sensor-show" ),
			html = "";

		if ( !OSApp.Analog.checkAnalogSensorAvail() ) {
			showArea.html( "" );
			return;
		}

		var i, j, sensor, progAdjust, sensorName, progName, val;

		// Program adjustments — compact inline labels above the tile grid
		if ( OSApp.Analog.progAdjusts && OSApp.Analog.progAdjusts.length ) {
			html += "<div class='prog-adjust-row'>";
			for ( i = 0; i < OSApp.Analog.progAdjusts.length; i++ ) {
				progAdjust = OSApp.Analog.progAdjusts[ i ];
				sensorName = "";
				for ( j = 0; j < OSApp.Analog.analogSensors.length; j++ ) {
					if ( OSApp.Analog.analogSensors[ j ].nr === progAdjust.sensor ) {
						sensorName = OSApp.Analog.analogSensors[ j ].name;
					}
				}
				progName = "?";
				if ( progAdjust.prog >= 1 && progAdjust.prog <= OSApp.currentSession.controller.programs.pd.length ) {
					progName = OSApp.Programs.readProgram( OSApp.currentSession.controller.programs.pd[ progAdjust.prog - 1 ] ).name;
				}
				html += "<span class='prog-adjust-label' id='progAdjust-show-" + progAdjust.nr + "'>" +
					sensorName + " \u2192 " + progName + ": " + Math.round( progAdjust.current * 100 ) + "%" +
					"</span>";
			}
			html += "</div>";
		}

		// Sensor tiles
		if ( OSApp.Analog.analogSensors ) {
			for ( i = 0; i < OSApp.Analog.analogSensors.length; i++ ) {
				sensor = OSApp.Analog.analogSensors[ i ];
				if ( !sensor.show ) { continue; }
				val = Number( Math.round( sensor.data + "e+2" ) + "e-2" );
				html += "<div class='card idle sensor-tile' id='sensor-show-" + sensor.nr + "'>" +
					"<div class='ui-body ui-body-a tile-inner'>" +
					"<div class='tile-row-top'>" +
					"<div class='tile-icon-pill'>" + ICON_GAUGE + "</div>" +
					"</div>" +
					"<div class='tile-row-mid'>" +
					"<div class='sensor-reading'>" +
					"<span class='sensor-val'>" + val + "</span>" +
					"<span class='sensor-unit'>" + ( sensor.unit || "" ) + "</span>" +
					"</div>" +
					"</div>" +
					"<div class='tile-row-bot'>" +
					"<p class='tile-name'>" + sensor.name + "</p>" +
					"</div>" +
					"</div>" +
					"</div>";
			}
		}

		showArea.html( html );
	}

	var content = '<div data-role="page" id="sprinklers">' +
			'<div class="ui-panel-wrapper">' +
				'<div class="ui-content" role="main">' +
					'<div class="ui-grid-a ui-body ui-corner-all info-card noweather">' +
						'<div class="ui-block-a center">' +
							'<div id="weather" class="pointer"></div>' +
							'<div id="restr-active" class="pointer settings-weather' + (( OSApp.currentSession.controller.settings?.wtrestr || 0 > 0 ) ? '' : ' hidden') + '">' +
								'<span class="bold blue-text">' + OSApp.Language._("Weather Restriction Active") + '</span>' +
							'</div>' +
						'</div>' +
						'<div class="ui-block-b center settings-weather home-info pointer">' +
							'<div class="sitename bold"></div>' +
							'<div id="clock-s" class="nobr"></div>' +
							'<div id="water-level">' +
								OSApp.Language._("Water Level") + ': <span class="waterlevel"></span>%' +
							'</div>' +
						'</div>' +
					'</div>' +
					'<div id="os-stations-list" class="card-group center"></div>' +
					'<div id="os-sensor-show" class="card-group center"></div>' +
				'</div>' +
			'</div>' +
		'</div>';

	var page = $(content),
		addTimer = function( station, rem ) {
			// Seed the countdown with the actual remaining time derived from
			// the firmware start timestamp, so it's correct even on mid-run page loads.
			var actualRem = getActualRemaining( station );
			OSApp.uiState.timers[ "station-" + station ] = {
				val: actualRem,
				station: station,
				update: function() {
					var useRing = canShowRing( station );
					if ( useRing ) {
						var pct = getRunProgress( station );
						var offset = ( RING_CIRC * ( 1 - pct / 100 ) ).toFixed( 2 );
						page.find( "#progress-" + station ).attr( "stroke-dashoffset", offset );
						page.find( "#countdown-" + station ).text( compactTime( this.val ) );
					} else {
						page.find( "#countdown-" + station ).text( OSApp.Dates.sec2hms( this.val ) );
					}
				},
				done: function() {
					var card = page.find( "[data-station='" + station + "']" ).first();
					card.find( ".station-status" ).removeClass( "on" ).addClass( "off" );
					card.find( ".tile-row-mid" ).html(
						"<span class='station-last-run tile-last-run'>" +
						( lastRunByStation[ station ] ? formatLastRun( lastRunByStation[ station ] ) : "" ) +
						"</span>"
					);
					card.find( ".tile-icon-pill" ).html( ICON_DROP );
					card.removeClass( "running scheduled" ).addClass( "idle" );
				}
			};
		},
		addCard = function( sid ) {
			var isScheduled = OSApp.Stations.getPID( sid ) > 0,
				isRunning = OSApp.Stations.isRunning( sid ),
				pid = OSApp.Stations.getPID( sid ),
				isManual = ( pid === 99 || pid === 255 ),
				rem = OSApp.Stations.getRemainingRuntime( sid ),
				useRing = isRunning && rem > 0 && canShowRing( sid ),
				pct = useRing ? getRunProgress( sid ) : 0,
				dashoffset = ( RING_CIRC * ( 1 - pct / 100 ) ).toFixed( 2 ),
				tileState = isRunning ? "running" : ( isScheduled ? "scheduled" : "idle" ),
				tileIcon  = isManual ? ICON_HAND : ( isScheduled ? ICON_CAL : ICON_DROP );

			if ( isRunning && rem > 0 ) {
				addTimer( sid, rem );
			}

			// ── Card wrapper ───────────────────────────────────────────────────────
			cards += "<div data-station='" + sid + "' class='ui-corner-all card " + tileState +
				( OSApp.Stations.isDisabled( sid ) ? " station-hidden' style='display:none" : "" ) + "'>";

			// ── Tile body ──────────────────────────────────────────────────────────
			cards += "<div class='ui-body ui-body-a tile-inner'>";

			// Row 1 — icon pill + plain SVG gear (no jQuery Mobile classes = no positioning fight)
			cards += "<div class='tile-row-top'>" +
				"<div class='tile-icon-pill'>" + tileIcon + "</div>" +
				"<div class='tile-gear-btn' data-station='" + sid + "'>" + ICON_GEAR + "</div>" +
				"</div>";

			// Hidden functional elements — jQuery Mobile attrib anchor, status dot, wifi icon, group label.
			// All kept in DOM (other code reads/writes them) but rendered off-screen.
			cards += "<span class='bno-border ui-btn ui-btn-icon-notext ui-corner-all card-icon station-status " +
				( isRunning ? "on" : ( isScheduled ? "wait" : "off" ) ) + "' style='position:absolute;left:-9999px;pointer-events:none'></span>";
			cards += "<span class='btn-no-border ui-btn ui-btn-icon-notext ui-icon-wifi card-icon special-station " +
				( OSApp.Stations.isSpecial( sid ) ? "" : "hidden" ) + "' style='position:absolute;left:-9999px;pointer-events:none'></span>";
			if ( OSApp.Supported.groups() ) {
				cards += "<span class='btn-no-border ui-btn card-icon station-gid " + ( OSApp.Stations.isMaster( sid ) ? "hidden" : "" ) +
					"' style='position:absolute;left:-9999px;pointer-events:none'>" +
					OSApp.Groups.mapGIDValueToName( OSApp.Stations.getGIDValue( sid ) ) + "</span>";
			}
			// Functional attrib anchor (hidden) — stores per-station settings data
			cards += "<span class='btn-no-border ui-btn " + ( OSApp.Stations.isMaster( sid ) ? "ui-icon-master" : "ui-icon-gear" ) +
				" card-icon ui-btn-icon-notext station-settings' data-station='" + sid + "' id='attrib-" + sid + "' " +
				"style='position:absolute;left:-9999px;pointer-events:none' " +
				( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_1 ) ? ( "data-um='" + ( OSApp.StationAttributes.getMasterOperation( sid, OSApp.Constants.options.MASTER_STATION_1 ) ) + "' " ) : "" ) +
				( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_2 ) ? ( "data-um2='" + ( OSApp.StationAttributes.getMasterOperation( sid, OSApp.Constants.options.MASTER_STATION_2 ) ) + "' " ) : "" ) +
				( OSApp.Supported.ignoreRain() ? ( "data-ir='" + ( OSApp.StationAttributes.getIgnoreRain( sid ) ) + "' " ) : "" ) +
				( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_1 ) ? ( "data-sn1='" + ( OSApp.StationAttributes.getIgnoreSensor( sid, OSApp.Constants.options.IGNORE_SENSOR_1 ) ) + "' " ) : "" ) +
				( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_2 ) ? ( "data-sn2='" + ( OSApp.StationAttributes.getIgnoreSensor( sid, OSApp.Constants.options.IGNORE_SENSOR_2 ) ) + "' " ) : "" ) +
				( OSApp.Supported.actRelay() ? ( "data-ar='" + ( OSApp.StationAttributes.getActRelay( sid ) ) + "' " ) : "" ) +
				( OSApp.Supported.disabled() ? ( "data-sd='" + ( OSApp.StationAttributes.getDisabled( sid ) ) + "' " ) : "" ) +
				( OSApp.Supported.sequential() ? ( "data-us='" + ( OSApp.StationAttributes.getSequential( sid ) ) + "' " ) : "" ) +
				( OSApp.Supported.special() ? ( "data-hs='" + ( OSApp.StationAttributes.getSpecial( sid ) ) + "' " ) : "" ) +
				( OSApp.Supported.groups() ? ( "data-gid='" + OSApp.Stations.getGIDValue( sid ) + "' " ) : "" ) +
				"></span>";

			// Row 2 — mid: ring | big-time | last-run | scheduled-info
			if ( !OSApp.Stations.isMaster( sid ) ) {
				if ( isRunning && rem > 0 ) {
					if ( useRing ) {
						cards += "<div class='tile-row-mid'>" +
							"<div class='ring-wrap'>" +
							"<svg class='tile-ring' viewBox='0 0 56 56'>" +
							"<circle class='ring-bg' cx='28' cy='28' r='" + RING_R + "'/>" +
							"<circle class='ring-fill' id='progress-" + sid + "' cx='28' cy='28' r='" + RING_R + "'" +
							" stroke-dasharray='" + RING_CIRC + "'" +
							" stroke-dashoffset='" + dashoffset + "'/>" +
							"</svg>" +
							"<span class='ring-time' id='countdown-" + sid + "'>" + compactTime( rem ) + "</span>" +
							"</div>" +
							"</div>";
					} else {
						cards += "<div class='tile-row-mid'>" +
							"<span class='tile-time-big' id='countdown-" + sid + "'>" + OSApp.Dates.sec2hms( rem ) + "</span>" +
							"</div>";
					}
				} else if ( isScheduled ) {
					var schedLabel = OSApp.Stations.getStartTime( sid ) ?
						OSApp.Dates.dateToString( new Date( OSApp.Stations.getStartTime( sid ) * 1000 ) ) :
						OSApp.Programs.pidToName( pid );
					cards += "<div class='tile-row-mid'>" +
						"<span class='tile-sched-label rem'>" + schedLabel + "</span>" +
						"</div>";
				} else {
					var lastRun = lastRunByStation[ sid ];
					cards += "<div class='tile-row-mid'>" +
						"<span class='station-last-run tile-last-run'>" + ( lastRun ? formatLastRun( lastRun ) : "" ) + "</span>" +
						"</div>";
				}
			} else {
				cards += "<div class='tile-row-mid'></div>";
			}

			// Row 3 — name
			cards += "<div class='tile-row-bot'>" +
				"<p class='station-name tile-name' id='station_" + sid + "'>" + OSApp.Stations.getName( sid ) + "</p>" +
				"</div>";

			cards += "</div>"; // .tile-inner

			// Divider (required by group-view logic)
			cards += "<hr style='display:none' class='content-divider'" +
				( OSApp.Supported.groups() ? " divider-gid=" + OSApp.Stations.getGIDValue( sid ) : "" ) + "></div>";
		},
		showAttributes = function() {
			$( "#stn_attrib" ).popup( "destroy" ).remove();

			var button = $( this ),
				sid = button.data( "station" ),
				name = page.find( "#station_" + sid ),
				showSpecialOptions = function( value ) {
					var opts = select.find( "#specialOpts" ),
						data = OSApp.currentSession.controller.special && Object.prototype.hasOwnProperty.call(OSApp.currentSession.controller.special,  sid ) ? OSApp.currentSession.controller.special[ sid ].sd : "",
						type  = OSApp.currentSession.controller.special && Object.prototype.hasOwnProperty.call(OSApp.currentSession.controller.special,  sid ) ? OSApp.currentSession.controller.special[ sid ].st : 0;

					opts.empty();

					if ( value === 0 ) {
						opts.append(
							"<p class='special-desc center small'>" +
							OSApp.Language._( "Select the station type using the dropdown selector above and configure the station properties." ) +
							"</p>"
						).enhanceWithin();
					} else if ( value === 1 ) {
						data = ( type === value ) ? data : "0000000000000000";

						opts.append(
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "RF Code" ) + ":</div>" +
							"<input class='center' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='rf-code' required='true' type='text' value='" + data + "'>"
						).enhanceWithin();
					} else if ( value === 2 ) {
						data = OSApp.Stations.parseRemoteStationData( ( type === value ) ? data : "00000000005000" );

						opts.append(
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Remote Address" ) + ":</div>" +
							"<input class='center' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='remote-address' required='true' type='text' pattern='^(?:[0-9]{1,3}.){3}[0-9]{1,3}$' value='" + data.ip + "'>" +
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Remote Port" ) + ":</div>" +
							"<input class='center' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='remote-port' required='true' type='number' placeholder='80' min='0' max='65535' value='" + data.port + "'>" +
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Remote Station" ) + ":</div>" +
							"<input class='center' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='remote-station' required='true' type='number' min='1' max='200' placeholder='1' value='" + ( data.station + 1 ) + "'>"
						).enhanceWithin();
					} else if ( value === 6 ) {
						data = OSApp.Stations.parseRemoteStationData( ( type === value ) ? data : "OT000000000000000000000000000000,00" );
						opts.append(
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Remote OTC Token" ) + ":</div>" +
							"<input class='center' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='remote-otc' required='true' type='text' pattern='^OT[a-fA-F0-9]{30}$' value='" + data.otc + "'>" +
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Remote Station" ) + ":</div>" +
							"<input class='center' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='remote-station' required='true' type='number' min='1' max='200' placeholder='1' value='" + ( data.station + 1 ) + "'>"
						).enhanceWithin();

					} else if ( value === 3 ) {

						// Extended special station model to support GPIO stations
						// Special data for GPIO Station is three bytes of ascii decimal (not hex)
						// First two bytes are zero padded GPIO pin number (default GPIO05)
						// Third byte is either 0 or 1 for active low (GND) or high (+5V) relays (default 1 for HIGH)
						// Restrict selection to GPIO pins available on the RPi R2.
						var gpioPin = 5, activeState = 1, freePins = [ ], sel;

						if ( OSApp.currentSession.controller.settings.gpio ) {
							freePins = OSApp.currentSession.controller.settings.gpio;
						} else if ( OSApp.Firmware.getHWVersion() === "OSPi" ) {
							freePins = [ 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 18, 19, 20, 21, 23, 24, 25, 26 ];
						} else if ( OSApp.Firmware.getHWVersion() === "2.3" ) {
							freePins = [ 2, 10, 12, 13, 14, 15, 18, 19 ];
						}

						if ( type === value ) {
							data = data.split( "" );
							gpioPin = parseInt( data[ 0 ] + data[ 1 ] );
							activeState = parseInt( data[ 2 ] );
						}

						if ( freePins.length ) {
							sel = "<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "GPIO Pin" ) + ":</div>" +
								"<select class='center' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='gpio-pin'>";
							for ( var i = 0; i < freePins.length; i++ ) {
								sel += "<option value='" + freePins[ i ] + "' " + ( freePins[ i ] === gpioPin ? "selected='selected'" : "" ) + ">" + freePins[ i ];
							}
							sel += "</select>";
						} else {
							sel = "";
						}

						sel += "<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Active State" ) + ":</div>" +
							"<select class='center' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='active-state'>" +
							"<option value='1' " + ( activeState === 1 ? "selected='selected'" : "" ) + ">" + OSApp.Language._( "HIGH" ) +
							"<option value='0' " + ( activeState === 0 ? "selected='selected'" : "" ) + ">" + OSApp.Language._( "LOW" ) +
							"</select>";

						opts.append( sel ).enhanceWithin();
					} else if ( value === 4 || value === 5 ) {
						data = ( type === value ) ? data.split( "," ) : ( value === 4 ? [ "server", "80", "On", "Off" ] : [ "server", "443", "On", "Off" ] );

						opts.append(
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Server Name" ) + ":</div>" +
							"<input class='center  validate-length' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='http-server' required='true' type='text' value='" + data[ 0 ] + "'>" +
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Server Port" ) + ":</div>" +
							"<input class='center  validate-length' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='http-port' required='true' type='number' min='0' max='65535' value='" + parseInt( data[ 1 ] ) + "'>" +
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "On Command" ) + ":</div>" +
							"<input class='center validate-length' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='http-on' required='true' type='text' value='" + data[ 2 ] + "'>" +
							"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Off Command" ) + ":</div>" +
							"<input class='center validate-length' data-corners='false' data-wrapper-class='tight ui-btn stn-name' id='http-off' required='true' type='text' value='" + data[ 3 ] + "'>" +
							"<div class='center smaller' id='character-tracking' style='color:#999;'>" +
							"<p>" +	OSApp.Language._( "Note: There is a limit on the number of character used to configure this station type." ) + "</p>" +
							"<span>" + OSApp.Language._( "Characters remaining" ) + ": </span><span id='character-count'>placeholder</span>" +
							"</div>"
						).enhanceWithin();

						validateLength();
						$( ".validate-length" ).on( "input", validateLength );
					}
				},
				validateLength = function() {
					var maxSDChars = 240,		// Maximum size of special data when uri encoded. Needs to be less than sizeof(SpecialStationData) i.e. 247 bytes
						sd = select.find( "#http-server" ).val() + "," + select.find( "#http-port" ).val() + "," +
							select.find( "#http-on" ).val() + "," + select.find( "#http-off" ).val(),
						sdLen = encodeURIComponent( sd ).length;

					select.find( "#character-count" ).text( maxSDChars - sdLen );

					if ( sdLen > maxSDChars ) {
						select.find( ".attrib-submit" ).addClass( "ui-disabled" );
						select.find( "#character-tracking" ).addClass( "red-text bold" );
					} else {
						select.find( ".attrib-submit" ).removeClass( "ui-disabled" );
						select.find( "#character-tracking" ).removeClass( "red-text bold" );
					}
				},
				saveChanges = function( checkPassed ) {
					var hs = parseInt( select.find( "#hs" ).val() );
					button.data( "hs", hs );

					if ( hs === 1 ) {
						button.data( "specialData", select.find( "#rf-code" ).val() );
					} else if ( hs === 2 || hs === 6 ) {
						var ip, port, otc, station, hex = "";
						station = ( select.find( "#remote-station" ).val() || 1 ) - 1;
						if ( hs === 2 ) {
							ip = select.find( "#remote-address" ).val().split( "." );
							port = parseInt( select.find( "#remote-port" ).val() ) || 80;
							for ( var i = 0; i < 4; i++ ) {
								hex += OSApp.Utils.pad( parseInt( ip[ i ] ).toString( 16 ) );
							}
							hex += OSApp.Utils.pad( (port>>8).toString( 16 ) ) + OSApp.Utils.pad( (port & 0xff).toString( 16 ) );
							hex += OSApp.Utils.pad( station.toString( 16 ) );
						} else {
							otc = select.find( "#remote-otc" ).val();
							hex += otc;
							hex += ",";
							hex += OSApp.Utils.pad( station.toString( 16 ) );
						}

						if ( checkPassed !== true ) {
							$.mobile.loading( "show" );
							select.find( ".attrib-submit" ).addClass( "ui-disabled" );

							OSApp.Stations.verifyRemoteStation( hex, function( result ) {
								var text;

								if ( result === true ) {
									saveChanges( true );
									return;
								} else if ( result === false || result === -1 ) {
									text = OSApp.Language._( "Unable to reach the remote station." );
								} else if ( result === -2 ) {

									// Likely an invalid password since the firmware version is present but no other data
									text = OSApp.Language._( "Password on remote controller does not match the password on this OSApp.currentSession.controller." );
								} else if ( result === -3 ) {

									// Remote controller is not configured as an extender
									text = OSApp.Language._( "Remote controller is not configured as an extender. Would you like to do this now?" );
								}

								select.one( "popupafterclose", function() {
									$.mobile.loading( "hide" );
									loader.css( "opacity", "" );
								} );

								$.mobile.loading( "show", {
									html: "<h1>" + text + "</h1>" +
										"<button class='ui-btn cancel'>" + OSApp.Language._( "Cancel" ) + "</button>" +
										"<button class='ui-btn continue'>" + OSApp.Language._( "Continue" ) + "</button>",
									textVisible: true,
									theme: "b"
								} );

								var loader = $( ".ui-loader" );

								loader.css( "opacity", ".96" );

								loader.find( ".cancel" ).one( "click", function() {
									$.mobile.loading( "hide" );
									loader.css( "opacity", "" );
								} );

								loader.find( ".continue" ).one( "click", function() {
									$.mobile.loading( "hide" );
									loader.css( "opacity", "" );

									if ( result === -3 ) {
										OSApp.Stations.convertRemoteToExtender( hex );
									}

									saveChanges( true );
								} );

								select.find( ".attrib-submit" ).removeClass( "ui-disabled" );
							} );
							return;
						}

						button.data( "specialData", hex );
					} else if ( hs === 3 ) {
						var sd = OSApp.Utils.pad( select.find( "#gpio-pin" ).val() || "05" );
						sd += select.find( "#active-state" ).val() || "1";
						button.data( "specialData", sd );
					} else if ( hs === 4 || hs === 5 ) {
						var sdata = select.find( "#http-server" ).val();
						sdata += "," + select.find( "#http-port" ).val();
						sdata += "," + select.find( "#http-on" ).val();
						sdata += "," + select.find( "#http-off" ).val();
						button.data( "specialData", sdata );
					}

					button.data( "um", select.find( "#um" ).is( ":checked" ) ? 1 : 0 );
					button.data( "um2", select.find( "#um2" ).is( ":checked" ) ? 1 : 0 );
					button.data( "ir", select.find( "#ir" ).is( ":checked" ) ? 1 : 0 );
					button.data( "sn1", select.find( "#sn1" ).is( ":checked" ) ? 1 : 0 );
					button.data( "sn2", select.find( "#sn2" ).is( ":checked" ) ? 1 : 0 );
					button.data( "ar", select.find( "#ar" ).is( ":checked" ) ? 1 : 0 );
					button.data( "sd", select.find( "#sd" ).is( ":checked" ) ? 1 : 0 );
					button.data( "us", select.find( "#us" ).is( ":checked" ) ? 1 : 0 );
					name.html( select.find( "#stn-name" ).val() );

					var seqGroupName = select.find( "span.seqgrp" ).text();
					button.attr( "data-gid", OSApp.Groups.mapGIDNameToValue( seqGroupName ) );

					// Update the notes section
					sites[ currentSite ].notes[ sid ] = select.find( "#stn-notes" ).val();
					OSApp.Storage.set( { "sites": JSON.stringify( sites ) }, () => OSApp.Network.cloudSaveSites() );

					submitStations( sid );
					select.popup( "destroy" ).remove();
				},
				select = "<div data-overlay-theme='b' data-role='popup' data-theme='a' id='stn_attrib'>" +
					"<fieldset style='margin:0' data-mini='true' data-corners='false' data-role='controlgroup'><form><div id='station-tabs'>";

			if ( typeof sid !== "number" ) {
				return false;
			}

			// Setup two tabs for station configuration (Basic / Advanced) when applicable
			if ( OSApp.Supported.special() ) {
				select += "<ul class='tabs'>" +
					"<li class='current' data-tab='tab-basic'>" + OSApp.Language._( "Basic" ) + "</li>" +
					"<li data-tab='tab-advanced'>" + OSApp.Language._( "Advanced" ) + "</li>" +
					"</ul>";
			}

			// Start of Basic Tab settings
			select += "<div id='tab-basic' class='tab-content current'>";

			select += "<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Station Name" ) + ":</div>" +
				"<input class='bold center' data-corners='false' data-wrapper-class='tight stn-name ui-btn' id='stn-name' type='text' value=\"" +
				OSApp.currentSession.controller.stations.snames[sid] + "\">";

			select += "<button class='changeBackground'>" +
				( typeof sites[ currentSite ].images[ sid ] !== "string" ? OSApp.Language._( "Add" ) : OSApp.Language._( "Change" ) ) + " " + OSApp.Language._( "Image" ) +
				"</button>";

			if ( !OSApp.Stations.isMaster( sid ) ) {
				if ( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_1 ) ) {
					select += "<label for='um'><input class='needsclick' data-iconpos='right' id='um' type='checkbox' " +
						( ( button.data( "um" ) === 1 ) ? "checked='checked'" : "" ) + ">" + OSApp.Language._( "Use Master" ) + " " +
						( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_2 ) ? "1" : "" ) + "</label>";
				}

				if ( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_2 ) ) {
					select += "<label for='um2'><input class='needsclick' data-iconpos='right' id='um2' type='checkbox' " +
						( ( button.data( "um2" ) === 1 ) ? "checked='checked'" : "" ) + ">" + OSApp.Language._( "Use Master" ) + " 2" +
						"</label>";
				}

				if ( OSApp.Supported.ignoreRain() ) {
					select += "<label for='ir'><input class='needsclick' data-iconpos='right' id='ir' type='checkbox' " +
						( ( button.data( "ir" ) === 1 ) ? "checked='checked'" : "" ) + ">" + OSApp.Language._( "Ignore Rain" ) +
						"</label>";
				}

				if ( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_1 ) ) {
					select += "<label for='sn1'><input class='needsclick' data-iconpos='right' id='sn1' type='checkbox' " +
						( ( button.data( "sn1" ) === 1 ) ? "checked='checked'" : "" ) + ">" + OSApp.Language._( "Ignore Sensor 1" ) +
						"</label>";
				}

				if ( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_2 ) ) {
					select += "<label for='sn2'><input class='needsclick' data-iconpos='right' id='sn2' type='checkbox' " +
						( ( button.data( "sn2" ) === 1 ) ? "checked='checked'" : "" ) + ">" + OSApp.Language._( "Ignore Sensor 2" ) +
						"</label>";
				}

				if ( OSApp.Supported.actRelay() ) {
					select += "<label for='ar'><input class='needsclick' data-iconpos='right' id='ar' type='checkbox' " +
						( ( button.data( "ar" ) === 1 ) ? "checked='checked'" : "" ) + ">" + OSApp.Language._( "Activate Relay" ) +
						"</label>";
				}

				if ( OSApp.Supported.disabled() ) {
					select += "<label for='sd'><input class='needsclick' data-iconpos='right' id='sd' type='checkbox' " +
						( ( button.data( "sd" ) === 1 ) ? "checked='checked'" : "" ) + ">" + OSApp.Language._( "Disable" ) +
						"</label>";
				}

				if ( OSApp.Supported.sequential() && !OSApp.Supported.groups() ) {
					select += "<label for='us'><input class='needsclick' data-iconpos='right' id='us' type='checkbox' " +
						( ( button.data( "us" ) === 1 ) ? "checked='checked'" : "" ) + ">" + OSApp.Language._( "Sequential" ) +
						"</label>";
				}
			}

			select += "<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Station Notes" ) + ":</div>" +
				"<textarea data-corners='false' class='tight stn-notes' id='stn-notes'>" +
				( sites[ currentSite ].notes[ sid ] ? sites[ currentSite ].notes[ sid ] : "" ) +
				"</textarea>";

			select += "</div>";

			// Start of Advanced Tab settings.
			select += "<div id='tab-advanced' class='tab-content'>";

			// Create sequential group selection menu
			if ( OSApp.Supported.groups() && !OSApp.Stations.isMaster( sid ) ) {
				select +=
					"<div class='ui-bar-a ui-bar seq-container'>" + OSApp.Language._( "Sequential Group" ) + ":</div>" +
					"<select id='gid' class='seqgrp' data-mini='true'></select>" +
					"<div><p id='prohibit-change' class='center hidden' style='color: #ff0033;'>Changing group designation is prohibited while station is running</p></div>";
			}

			// Station tab is initially set to disabled until we have refreshed station data from firmware
			// Note: HTTPS and Remote OTC stations are supported at the same time with Email notification support
			if ( OSApp.Supported.special() ) {
				select +=
					"<div class='ui-bar-a ui-bar'>" + OSApp.Language._( "Station Type" ) + ":</div>" +
					"<select data-mini='true' id='hs'"  + ( OSApp.Stations.isSpecial( sid ) ? " class='ui-disabled'" : "" ) + ">" +
					"<option data-hs='0' value='0'" + ( OSApp.Stations.isSpecial( sid ) ? "" : "selected" ) + ">" + OSApp.Language._( "Standard" ) + "</option>" +
					"<option data-hs='1' value='1'>" + OSApp.Language._( "RF" ) + "</option>" +
					"<option data-hs='2' value='2'>" + OSApp.Language._( "Remote Station (IP)" ) + "</option>" +
					"<option data-hs='3' value='3'" + (
						OSApp.Firmware.checkOSVersion( 217 ) && (
							( typeof OSApp.currentSession.controller.settings.gpio !== "undefined" && OSApp.currentSession.controller.settings.gpio.length > 0 ) || OSApp.Firmware.getHWVersion() === "OSPi" || OSApp.Firmware.getHWVersion() === "2.3"
						) ? ">" : " disabled>"
					) + OSApp.Language._( "GPIO" ) + "</option>" +
					"<option data-hs='4' value='4'" + ( OSApp.Firmware.checkOSVersion( 217 ) ? ">" : " disabled>" ) + OSApp.Language._( "HTTP" ) + "</option>" +
					"<option data-hs='5' value='5'" + ( typeof OSApp.currentSession.controller.settings.email === "object" ? ">" : " disabled>" ) + OSApp.Language._( "HTTPS" ) + "</option>" +
					"<option data-hs='6' value='6'" + ( typeof OSApp.currentSession.controller.settings.email === "object" ? ">" : " disabled>" ) + OSApp.Language._( "Remote Station (OTC)" ) + "</option>" +
					"</select>" +
					"<div id='specialOpts'></div>";
			}

			select += "</div>";

			// Common Submit button
			select += "<input data-wrapper-class='attrib-submit' data-theme='b' type='submit' value='" + OSApp.Language._( "Submit" ) + "' /></form></fieldset></div>";

			select = $( select ).enhanceWithin().on( "submit", "form", function() {
				saveChanges( sid );
				return false;
			} );

			// Populate sequential group selection menu
			if ( OSApp.Supported.groups() ) {
				var seqGroupSelect = select.find( "select.seqgrp" ),
					seqGroupLabel = select.find( "span.seqgrp" ),
					stationGID = OSApp.Stations.getGIDValue( sid );

				var isRunning = OSApp.Stations.isRunning( sid ),
					prohibitChange = select.find( "p#prohibit-change" );
				if ( isRunning ) {
					seqGroupSelect.addClass( "ui-state-disabled" );
					prohibitChange.removeClass( "hidden" );
				} else {
					seqGroupSelect.removeClass( "ui-state-disabled" );
					prohibitChange.addClass( "hidden" );
				}

				for ( var i = 0; i <= OSApp.Constants.options.NUM_SEQ_GROUPS; i++ ) {
					var value = OSApp.Groups.mapIndexToGIDValue( i ),
						label = OSApp.Groups.mapGIDValueToName( value ),
						option = $(
							"<option data-gid='" + value + "' value='" +
							value + "'>" +  OSApp.Language._( label ) + "</option>"
						);

					if ( value === stationGID ) {
						option.prop( "selected", true );
						seqGroupLabel.text( label );
					} else {
						option.prop( "selected", false  );
					}
					seqGroupSelect.append( option );
				}
			}

			// Display the selected tab when clicked
			select.find( "ul.tabs li" ).click( function() {
				var tabId = $( this ).attr( "data-tab" );

				$( "ul.tabs li" ).removeClass( "current" );
				$( ".tab-content" ).removeClass( "current" );

				$( this ).addClass( "current" );
				$( "#" + tabId ).addClass( "current" );
			} );

			// Update Advanced tab whenever a new special station type is selected
			select.find( "#hs" ).on( "change", function() {
				var value = parseInt( $( this ).val() );
				showSpecialOptions( value );
				return false;
			} );

			// Refresh station data from firmware and update the Advanced tab to reflect special station type
			if ( OSApp.Stations.isSpecial( sid ) ) {
				OSApp.Sites.updateControllerStationSpecial( function() {
					select.find( "#hs" )
						.removeClass( "ui-disabled" )
						.find( "option[data-hs='" + OSApp.currentSession.controller.special[ sid ].st + "']" ).prop( "selected", true );
					select.find( "#hs" ).change();
				} );
			} else {
				select.find( "#hs" ).removeClass( "ui-disabled" );
				select.find( "option[data-hs='0']" ).prop( "selected", true );
				select.find( "#hs" ).change();
			}

			select.find( ".changeBackground" ).on( "click", function( e ) {
				e.preventDefault();
				var button = this;

				OSApp.UIDom.getPicture( function( image ) {
					sites[ currentSite ].images[ sid ] = image;
					OSApp.Storage.set( { "sites":JSON.stringify( sites ) }, () => OSApp.Network.cloudSaveSites() );
					updateContent();

					button.innerHTML =  OSApp.Language._( "Change" ) + " " + OSApp.Language._( "Image" );
				} );
			} );

			$.mobile.pageContainer.append( select );

			var opts = { history: false };

			if ( OSApp.currentDevice.isiOS ) {
				var pageTop = OSApp.UIDom.getPageTop();

				opts.x = pageTop.x;
				opts.y = pageTop.y;
			} else {
				opts.positionTo = "window";
			}

			select.popup( opts ).popup( "open" );
		},
		submitStations = function( id ) {
			var is208 = ( OSApp.Firmware.checkOSVersion( 208 ) === true ),
				master = {},
				master2 = {},
				sequential = {},
				special = {},
				rain = {},
				sensor1 = {},
				sensor2 = {},
				relay = {},
				disable = {},
				names = {},
				attrib, bid, sid, gid, s;

			for ( bid = 0; bid < OSApp.currentSession.controller.settings.nbrd; bid++ ) {
				if ( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_1 ) ) {
					master[ "m" + bid ] = 0;
				}
				if ( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_2 ) ) {
					master2[ "n" + bid ] = 0;
				}
				if ( OSApp.Supported.sequential() ) {
					sequential[ "q" + bid ] = 0;
				}
				if ( OSApp.Supported.special() ) {
					special[ "p" + bid ] = 0;
				}
				if ( OSApp.Supported.ignoreRain() ) {
					rain[ "i" + bid ] = 0;
				}
				if ( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_1 ) ) {
					sensor1[ "j" + bid ] = 0;
				}
				if ( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_2 ) ) {
					sensor2[ "k" + bid ] = 0;
				}
				if ( OSApp.Supported.actRelay() ) {
					relay[ "a" + bid ] = 0;
				}
				if ( OSApp.Supported.disabled() ) {
					disable[ "d" + bid ] = 0;
				}

				for ( s = 0; s < 8; s++ ) {
					sid = bid * 8 + s;
					attrib = page.find( "#attrib-" + sid );

					if ( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_1 ) ) {
						master[ "m" + bid ] = ( master[ "m" + bid ] ) + ( attrib.data( "um" ) << s );
					}

					if ( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_2 ) ) {
						master2[ "n" + bid ] = ( master2[ "n" + bid ] ) + ( attrib.data( "um2" ) << s );
					}

					if ( OSApp.Supported.sequential() ) {
						sequential[ "q" + bid ] = ( sequential[ "q" + bid ] ) + ( attrib.data( "us" ) << s );
					}

					if ( OSApp.Supported.special() ) {
						special[ "p" + bid ] = ( special[ "p" + bid ] ) + ( ( attrib.data( "hs" ) ? 1 : 0 ) << s );
					}

					if ( OSApp.Supported.ignoreRain() ) {
						rain[ "i" + bid ] = ( rain[ "i" + bid ] ) + ( attrib.data( "ir" ) << s );
					}

					if ( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_1 ) ) {
						sensor1[ "j" + bid ] = ( sensor1[ "j" + bid ] ) + ( attrib.data( "sn1" ) << s );
					}

					if ( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_2 ) ) {
						sensor2[ "k" + bid ] = ( sensor2[ "k" + bid ] ) + ( attrib.data( "sn2" ) << s );
					}

					if ( OSApp.Supported.actRelay() ) {
						relay[ "a" + bid ] = ( relay[ "a" + bid ] ) + ( attrib.data( "ar" ) << s );
					}

					if ( OSApp.Supported.disabled() ) {
						disable[ "d" + bid ] = ( disable[ "d" + bid ] ) + ( attrib.data( "sd" ) << s );
					}

					// Only send the name of the station being updated
					if ( sid === id ) {

						// Because the firmware has a bug regarding spaces, let us replace them out now with a compatible separator
						if ( is208 ) {
							names[ "s" + sid ] = page.find( "#station_" + sid ).text().replace( /\s/g, "_" );
						} else {
							names[ "s" + sid ] = page.find( "#station_" + sid ).text();
						}

						if ( OSApp.Supported.special() && attrib.data( "hs" ) ) {
							special.st = attrib.data( "hs" );
							special.sd = attrib.data( "specialData" );
							special.sid = id;
						}

						if ( OSApp.Supported.groups() ) {
							gid = attrib.attr( "data-gid" );
						}
					}
				}
			}

			$.mobile.loading( "show" );
			OSApp.Firmware.sendToOS( "/cs?pw=&" + $.param( names ) +
				( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_1 ) ? "&" + $.param( master ) : "" ) +
				( OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_2 ) ? "&" + $.param( master2 ) : "" ) +
				( OSApp.Supported.sequential() ? "&" + $.param( sequential ) : "" ) +
				( OSApp.Supported.special() ? "&" + $.param( special ) : "" ) +
				( OSApp.Supported.ignoreRain() ? "&" + $.param( rain ) : "" ) +
				( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_1 ) ? "&" + $.param( sensor1 ) : "" ) +
				( OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_2 ) ? "&" + $.param( sensor2 ) : "" ) +
				( OSApp.Supported.actRelay() ? "&" + $.param( relay ) : "" ) +
				( OSApp.Supported.disabled() ? "&" + $.param( disable ) : "" ) +
				( OSApp.Supported.groups() ? "&g" + id + "=" + gid : "" )
			).done( function() {
				OSApp.Errors.showError( OSApp.Language._( "Stations have been updated" ) );
				OSApp.Sites.updateController( function() {
					$( "html" ).trigger( "datarefresh" );
				} );
			} );
		},
		updateClock = function() {

			// Update the current time
			OSApp.uiState.timers.clock = {
				val: OSApp.currentSession.controller.settings.devt,
				update: function() {
					page.find( "#clock-s" ).text( OSApp.Dates.dateToString( new Date( this.val * 1000 ), null, 1 ) );
				}
			};
		},
		compareCardsGroupView = function( a, b ) {

			/* Sorting order: 	master ->
								sequential group id ->
								active status ->
								station id OR alphabetical
			*/

			var cardA = $( a ), cardB = $( b );

			// Station IDs
			var sidA = OSApp.Cards.getSID( cardA );
			var sidB = OSApp.Cards.getSID( cardB );

			// Station Names
			var nameA = OSApp.Stations.getName( sidA );
			var nameB = OSApp.Stations.getName( sidB );

			// Verify if a master station
			var masA = OSApp.Stations.isMaster( sidA ) > 0 ? 1 : 0;
			var masB = OSApp.Stations.isMaster( sidB ) > 0 ? 1 : 0;

			if ( masA > masB ) {
				return -1;
			} else if ( masA < masB ) {
				return 1;
			} else { // If both or neither master check group id

				var gidA = OSApp.Stations.getGIDValue( OSApp.Cards.getSID( cardA ) );
				var gidB = OSApp.Stations.getGIDValue( OSApp.Cards.getSID( cardB ) );

				if ( gidA < gidB ) {
					return -1;
				} else if ( gidA > gidB ) {
					return 1;
				} else { // If same group shift running stations up

					var statusA = OSApp.Stations.getStatus( sidA );
					var statusB = OSApp.Stations.getStatus( sidB );

					if ( statusA > statusB ) {
						return -1;
					} else if ( statusA < statusB ) {
						return 1;
					} else {
						if( OSApp.uiState.sortByStationName ) {
							if ( nameA < nameB ) { return -1; } else if ( nameA > nameB ) { return 1; } else { return 0; }
						}else{
							if ( sidA < sidB ) { return -1; } else if ( sidA > sidB ) { return 1; } else { return 0; }
						}
					}
				}
			}
		},
		compareCardsStandardView = function( a, b ) {

			/* Sorting order: 	running status ->
								station id OR alphabetical
			 */

			var cardA = $( a ), cardB = $( b );

			var sidA = OSApp.Cards.getSID( cardA );
			var sidB = OSApp.Cards.getSID( cardB );

			var nameA = OSApp.Stations.getName( sidA );
			var nameB = OSApp.Stations.getName( sidB );

			var statusA = OSApp.Stations.getStatus( sidA );
			var statusB = OSApp.Stations.getStatus( sidB );

			if ( statusA > statusB ) {
				return -1;
			} else if ( statusA < statusB ) {
				return 1;
			} else {
				if ( OSApp.uiState.sortByStationName){
					if ( nameA < nameB ) {
						return -1;
					} else if ( nameA > nameB ) {
						return 1;
					} else {
						return 0;
					}
				} else {
					if ( sidA < sidB ) {
						return -1;
					}
					if ( sidA > sidB ) {
						return 1;
					}
					return 0;
				}
			}
		},

		updateGroupView = function( cardHolder, cardList ) {
			var thisCard, nextCard, divider, label, idx;

			for ( idx = 0; idx < cardHolder.children().length; idx++ ) {
				thisCard = OSApp.CardList.getCardByIndex( cardList, idx );
				OSApp.Cards.setGroupLabel( thisCard, OSApp.Cards.getGIDName( thisCard ) );
			}
			for ( idx = 0; idx < cardHolder.children().length - 1; idx++ ) {
				thisCard = OSApp.CardList.getCardByIndex( cardList, idx );
				nextCard = OSApp.CardList.getCardByIndex( cardList, idx + 1 );

				divider = OSApp.Cards.getDivider( thisCard );
				label = OSApp.Cards.getGroupLabel( thisCard );

				// Display master separately
				if ( OSApp.Cards.isMasterStation( thisCard ) ) {
					if ( !OSApp.Cards.isMasterStation( nextCard ) ) {
						divider.show();
					} else {
						divider.hide();
					}
					label.addClass( "hidden" );
					continue;
				}

				if ( OSApp.Stations.getGIDValue( OSApp.Cards.getSID( thisCard ) ) !== OSApp.Stations.getGIDValue( OSApp.Cards.getSID( nextCard ) ) ) {
					divider.show();
				} else {
					divider.hide();
				}
			}
			OSApp.Cards.getDivider( nextCard ).show(); // Last group divider
			OSApp.Cards.setGroupLabel( nextCard, OSApp.Cards.getGIDName( nextCard ) );
		},
		updateStandardView = function( cardHolder, cardList ) {
			var thisCard, nextCard, divider, label, idx;
			for ( idx = 0; idx < cardHolder.children().length - 1; idx++ ) {
				thisCard = OSApp.CardList.getCardByIndex( cardList, idx );
				nextCard = OSApp.CardList.getCardByIndex( cardList, idx + 1 );

				divider = OSApp.Cards.getDivider( thisCard );
				divider.hide(); // Remove all dividers when switching from group view

				OSApp.Cards.setGroupLabel( thisCard, OSApp.Groups.mapGIDValueToName( OSApp.Stations.getGIDValue( OSApp.Cards.getSID( thisCard ) ) ) );
				label = OSApp.Cards.getGroupLabel( thisCard );
				if ( typeof label !== "undefined" && OSApp.Cards.isMasterStation( thisCard ) ) {
					label.addClass( "hidden" );
				}

				//  Display divider between active and non-active stations
				if ( OSApp.Stations.isRunning( OSApp.Cards.getSID( thisCard ) ) &&
					!OSApp.Stations.isRunning( OSApp.Cards.getSID( nextCard ) ) ) {
					divider.show();
				}
			}
			OSApp.Cards.getDivider( nextCard ).hide();
			OSApp.Cards.setGroupLabel( nextCard, OSApp.Groups.mapGIDValueToName( OSApp.Stations.getGIDValue( OSApp.Cards.getSID( nextCard ) ) ) );
			label = OSApp.Cards.getGroupLabel( nextCard );
			if ( typeof label !== "undefined" && OSApp.Cards.isMasterStation( nextCard ) ) {
				label.addClass( "hidden" );
			}
		},
		reorderCards = function() {
			var cardHolder = page.find( "#os-stations-list" ),
				cardList = cardHolder.children(),
				compareCards = OSApp.uiState.groupView ? compareCardsGroupView : compareCardsStandardView;

			// Sort stations
			cardList.sort( compareCards ).detach().appendTo( cardHolder );

			if ( OSApp.Supported.groups() && OSApp.uiState.groupView ) {
				updateGroupView( cardHolder, cardList );
			} else {
				updateStandardView( cardHolder, cardList );
			}
		},
		updateContent = function() {
			var cardHolder = page.find( "#os-stations-list" ),
				cardList = cardHolder.children(),
				isScheduled, isRunning, pname, rem, qPause, card, line, hasImage;

			if ( !page.hasClass( "ui-page-active" ) ) {
				return;
			}

			updateClock();
			updateSites();
			OSApp.Dashboard.updateWaterLevel();
			OSApp.Dashboard.updateRestrictNotice();
			renderSensorTiles( page );

			page.find( ".sitename" ).text( OSApp.currentSession.local ? OSApp.currentSession.controller.settings?.dname || "" : siteSelect.val() );

			// Remove unused stations
			OSApp.CardList.getAllCards( cardList ).filter( function( _, a ) {
				return parseInt( $( a ).data( "station" ), 10 ) >= OSApp.currentSession.controller.stations.snames.length;
			} ).remove();

			for ( var sid = 0; sid < OSApp.currentSession.controller.stations.snames.length; sid++ ) {
				isScheduled = OSApp.Stations.getPID( sid ) > 0;
				isRunning = OSApp.Stations.getStatus( sid ) > 0;
				pname = isScheduled ? OSApp.Programs.pidToName( OSApp.Stations.getPID( sid ) ) : "";
				rem = OSApp.Stations.getRemainingRuntime( sid ),
					qPause = OSApp.StationQueue.isPaused(),
					hasImage = sites[ currentSite ].images[ sid ] ? true : false;

				card = OSApp.CardList.getCardBySID( cardList, sid );

				if ( card.length === 0 ) {
					cards = "";
					addCard( sid );
					cardHolder.append( cards );
				} else {
					if ( OSApp.Stations.isDisabled( sid ) ) {
						if ( !page.hasClass( "show-hidden" ) ) {
							card.hide();
						}
						card.addClass( "station-hidden" );
					} else {
						card.show().removeClass( "station-hidden" );
					}

					// Update name
					card.find( "#station_" + sid ).text( OSApp.Stations.getName( sid ) );

					// Update hidden functional elements
					card.find( ".special-station" ).removeClass( "hidden" ).addClass( OSApp.Stations.isSpecial( sid ) ? "" : "hidden" );
					card.find( ".station-status" ).removeClass( "on off wait" ).addClass( isRunning ? "on" : ( isScheduled ? "wait" : "off" ) );
					if ( OSApp.Stations.isMaster( sid ) ) {
						card.find( ".station-settings" ).removeClass( "ui-icon-gear" ).addClass( "ui-icon-master" );
					} else {
						card.find( ".station-settings" ).removeClass( "ui-icon-master" ).addClass( "ui-icon-gear" );
					}

					card.find( ".station-settings" ).data( {
						um: OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_1 ) ? OSApp.StationAttributes.getMasterOperation( sid, OSApp.Constants.options.MASTER_STATION_1 ) : undefined,
						um2: OSApp.Supported.master( OSApp.Constants.options.MASTER_STATION_2 ) ? OSApp.StationAttributes.getMasterOperation( sid, OSApp.Constants.options.MASTER_STATION_2 ) : undefined,
						ir: OSApp.Supported.ignoreRain() ? OSApp.StationAttributes.getIgnoreRain( sid ) : undefined,
						sn1: OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_1 ) ? OSApp.StationAttributes.getIgnoreSensor( sid, OSApp.Constants.options.IGNORE_SENSOR_1 ) : undefined,
						sn2: OSApp.Supported.ignoreSensor( OSApp.Constants.options.IGNORE_SENSOR_2 ) ? OSApp.StationAttributes.getIgnoreSensor( sid, OSApp.Constants.options.IGNORE_SENSOR_2 ) : undefined,
						ar: OSApp.Supported.actRelay() ? OSApp.StationAttributes.getActRelay( sid ) : undefined,
						sd: OSApp.Supported.disabled() ? OSApp.StationAttributes.getDisabled( sid ) : undefined,
						us: OSApp.Supported.sequential() ? OSApp.StationAttributes.getSequential( sid ) : undefined,
						hs: OSApp.Supported.special() ? OSApp.StationAttributes.getSpecial( sid ) : undefined,
						gid: OSApp.Supported.groups() ? OSApp.Stations.getGIDValue( sid ) : undefined
					} );

					// ── Tile state transition ──────────────────────────────────────────
					var tileState  = isRunning ? "running" : ( isScheduled ? "scheduled" : "idle" );
					var pid        = OSApp.Stations.getPID( sid );
					var isManual   = ( pid === 99 || pid === 255 );
					var tileIcon   = isManual ? ICON_HAND : ( isScheduled ? ICON_CAL : ICON_DROP );
					var prevState  = card.hasClass( "running" ) ? "running" : ( card.hasClass( "scheduled" ) ? "scheduled" : "idle" );

					card.removeClass( "running scheduled idle" ).addClass( tileState );
					card.find( ".tile-icon-pill" ).html( tileIcon );

					var mid = card.find( ".tile-row-mid" );

					if ( !OSApp.Stations.isMaster( sid ) ) {
						if ( isRunning && rem > 0 ) {
							var useRing = canShowRing( sid );
							var pct = useRing ? getRunProgress( sid ) : 0;
							var dashoffset = ( RING_CIRC * ( 1 - pct / 100 ) ).toFixed( 2 );

							if ( useRing ) {
								if ( mid.find( ".ring-wrap" ).length === 0 ) {
									mid.html(
										"<div class='ring-wrap'>" +
										"<svg class='tile-ring' viewBox='0 0 56 56'>" +
										"<circle class='ring-bg' cx='28' cy='28' r='" + RING_R + "'/>" +
										"<circle class='ring-fill' id='progress-" + sid + "' cx='28' cy='28' r='" + RING_R + "'" +
										" stroke-dasharray='" + RING_CIRC + "'" +
										" stroke-dashoffset='" + dashoffset + "'/>" +
										"</svg>" +
										"<span class='ring-time' id='countdown-" + sid + "'>" + compactTime( rem ) + "</span>" +
										"</div>"
									);
								} else {
									card.find( "#progress-" + sid ).attr( "stroke-dashoffset", dashoffset );
									card.find( "#countdown-" + sid ).text( compactTime( rem ) );
								}
							} else {
								if ( mid.find( ".tile-time-big" ).length === 0 ) {
									mid.html( "<span class='tile-time-big' id='countdown-" + sid + "'>" + OSApp.Dates.sec2hms( rem ) + "</span>" );
								} else {
									card.find( "#countdown-" + sid ).text( OSApp.Dates.sec2hms( rem ) );
								}
							}

							if ( isRunning ) {
								addTimer( sid, rem );
							} else if ( OSApp.uiState.timers[ "station-" + sid ] ) {
								delete OSApp.uiState.timers[ "station-" + sid ];
							}

						} else if ( isScheduled ) {
							var schedLabel = OSApp.Stations.getStartTime( sid ) ?
								OSApp.Dates.dateToString( new Date( OSApp.Stations.getStartTime( sid ) * 1000 ) ) :
								OSApp.Programs.pidToName( pid );
							if ( mid.find( ".tile-sched-label" ).length === 0 ) {
								mid.html( "<span class='tile-sched-label rem'>" + schedLabel + "</span>" );
							} else {
								mid.find( ".tile-sched-label" ).text( schedLabel );
							}

						} else {
							// Idle — update last-run label
							var lastRunTs = lastRunByStation[ sid ];
							if ( mid.find( ".station-last-run" ).length === 0 ) {
								mid.html( "<span class='station-last-run tile-last-run'>" + ( lastRunTs ? formatLastRun( lastRunTs ) : "" ) + "</span>" );
							} else {
								mid.find( ".station-last-run" ).text( lastRunTs ? formatLastRun( lastRunTs ) : "" );
							}
						}
					}

				}
			}

			reorderCards();
		},
		updateSites = function( callback ) {
			callback = callback || function() {};

			currentSite = siteSelect.val();
			OSApp.Storage.get( "sites", function( data ) {
				sites = OSApp.Sites.parseSites( data.sites );
				// Prevent errors during test: page navigation checks
				if ( !sites || $.isEmptyObject(sites) || !currentSite ) {
					return;
				}

				if ( typeof sites[ currentSite ]?.images !== "object" || $.isEmptyObject( sites[ currentSite ].images ) ) {
					sites[ currentSite ].images = {};
					page.removeClass( "has-images" );
				} else {
					page.addClass( "has-images" );
				}
				if ( typeof sites[ currentSite ]?.notes !== "object" ) {
					sites[ currentSite ].notes = {};
				}
				if ( typeof sites[ currentSite ]?.lastRunTime !== "object" ) {
					sites[ currentSite ].lastRunTime = {};
				}

				callback();
			} );
		};


	page.one( "pageshow", function() {
		$( "html" ).on( "datarefresh", updateContent );
		fetchLastRun();
	} );

	function begin( firstLoad ) {
		if ( !OSApp.currentSession.isControllerConnected() ) {
			return false;
		}

		cards = "";
		siteSelect = $( "#site-selector" );

		updateSites( function() {
			for ( i = 0; i < OSApp.currentSession.controller.stations.snames.length; i++ ) {
				addCard( i );
			}

			page.find( "#os-stations-list" ).html( cards );
			reorderCards();
		} );

		page.find( ".sitename" ).toggleClass( "hidden", OSApp.currentSession.local ? (OSApp.currentSession.controller.settings?.dname ? false : true) : false );
		page.find( ".sitename" ).text( OSApp.currentSession.local ? OSApp.currentSession.controller.settings?.dname || "" : siteSelect.val() );
		page.find( ".waterlevel" ).text( OSApp.currentSession.controller.options.wl );

		renderSensorTiles( page );
		updateClock();

		page.on( "click", ".station-settings", showAttributes );

		// Proxy the visible SVG gear button → hidden #attrib-{sid} so showAttributes
		// sees the correct `this` (the element that stores all station data attributes).
		page.on( "click", ".tile-gear-btn", function( e ) {
			e.stopPropagation();
			page.find( "#attrib-" + $( this ).data( "station" ) ).trigger( "click" );
		} );

		page.on( "click", ".settings-weather", function() {
			OSApp.UIDom.changePage( "#os-options", {
				expandItem: "weather"
			} );
			return false;
		} );

		page.on( "click", ".card", function() {

			// Bind delegate handler to stop specific station (supported on firmware 2.1.0+ on Arduino)
			if ( !OSApp.Firmware.checkOSVersion( 210 ) ) {
				return false;
			}

			var el = $( this ),
				sid = OSApp.Cards.getSID( el ),
				stationGID = OSApp.Cards.getGIDValue( el ),
				currentStatus = OSApp.Stations.getStatus( sid ),
				name = OSApp.Stations.getName( sid ),
				question, dialogOptions = {};

			if ( OSApp.Stations.isMaster( sid ) ) {
				return false;
			}

			dialogOptions.type = OSApp.Constants.dialog.REMOVE_STATION;
			dialogOptions.station = sid;
			dialogOptions.gid = stationGID;

			if ( currentStatus ) {
				question = OSApp.Language._( "Do you want to stop the selected station?" );
			} else {
				if ( el.find( "span.nobr" ).length ) {
					question = OSApp.Language._( "Do you want to unschedule the selected station?" );
				} else {
					OSApp.UIDom.showDurationBox( {
						title: name,
						incrementalUpdate: false,
						maximum: 64800,
						seconds: sites[ currentSite ].lastRunTime[ sid ] > 0 ? sites[ currentSite ].lastRunTime[ sid ] : 0,
						helptext: OSApp.Language._( "Enter a duration to manually run " ) + name,
						showQOCheckbox: OSApp.Groups.canPreempt( stationGID ) && OSApp.Stations.isSequential( sid ),
						callback: function( duration, qo ) {
							var preParam = qo ? "&qo=1" : "";
							OSApp.Firmware.sendToOS( "/cm?sid=" + sid + "&en=1&t=" + duration + preParam + "&pw=", "json" ).done( function() {

								// Update local state until next device refresh occurs
								OSApp.Stations.setPID( sid, OSApp.Constants.options.MANUAL_STATION_PID );
								OSApp.Stations.setRemainingRuntime( sid, duration );

								OSApp.Status.refreshStatus();
								OSApp.Errors.showError( OSApp.Language._( "Station has been queued" ) );

								// Save run time for this station
								sites[ currentSite ].lastRunTime[ sid ] = duration;
								OSApp.Storage.set( { "sites": JSON.stringify( sites ) }, () => OSApp.Network.cloudSaveSites() );
							} );
						}
					} );
					return;
				}
			}

			OSApp.UIDom.areYouSure( question, OSApp.Stations.getName( sid ), function() {

				var shiftStations = OSApp.uiState.popupData.shift === true ? 1 : 0;

				OSApp.Firmware.sendToOS( "/cm?sid=" + sid + "&ssta=" + shiftStations + "&en=0&pw=" ).done( function() {

					// Update local state until next device refresh occurs
					OSApp.Stations.setPID( sid, 0 );
					OSApp.Stations.setRemainingRuntime( sid, 0 );
					OSApp.Stations.setStatus( sid, 0 );

					// Remove any timer associated with the station
					delete OSApp.uiState.timers[ "station-" + sid ];

					OSApp.Status.refreshStatus();
					OSApp.Errors.showError( OSApp.Language._( "Station has been stopped" ) );
				} );
			}, null, dialogOptions );
		} )

			.on( "click", "img", function() {
				var image = $( this ),
					id = image.parents( ".card" ).data( "station" ),
					hasImage = image.attr( "src" ).indexOf( "data:image/jpeg;base64" ) === -1 ? false : true;

				if ( hasImage ) {
					OSApp.UIDom.areYouSure( OSApp.Language._( "Do you want to delete the current image?" ), "", function() {
						delete sites[ currentSite ].images[ id ];
						OSApp.Storage.set( { "sites":JSON.stringify( sites ) }, () => OSApp.Network.cloudSaveSites() );
						updateContent();
					} );
				} else {
					OSApp.UIDom.getPicture( function( image ) {
						sites[ currentSite ].images[ id ] = image;
						OSApp.Storage.set( { "sites":JSON.stringify( sites ) }, () => OSApp.Network.cloudSaveSites() );
						updateContent();
					} );
				}

				return false;
			} )

			.on( {
				pagebeforeshow: function() {
					var header = OSApp.UIDom.changeHeader( {
						class: "logo",
						leftBtn: {
							icon: "bullets",
							on: function() {
								OSApp.uiState.openPanel();
								return false;
							}
						},
						rightBtn: {
							icon: "bell",
							class: "notifications",
							text: "<span class='notificationCount ui-li-count ui-btn-corner-all'>" + OSApp.uiState.notifications.length + "</span>",
							on: function() {
								OSApp.Notifications.showNotifications();
								return false;
							}
						},
						animate: ( firstLoad ? false : true )
					} );

					if ( OSApp.uiState.notifications.length === 0 ) {
						$( header[ 2 ] ).hide();
					}
				}
			} );

		$( "#sprinklers" ).remove();
		$.mobile.pageContainer.append( page );

		if ( !$.isEmptyObject( OSApp.currentSession.weather ) ) {
			OSApp.Weather.updateWeatherBox();
		}
	}

	return begin();
};

OSApp.Dashboard.updateWaterLevel = function() {
	// Update the water level displayed on the dashboard
	if ( !OSApp.currentSession.controller.options ) {
		return;
	}
	$( "#water-level" ).html(OSApp.Language._( "Water Level" ) + ": <span class='waterlevel'>" + OSApp.currentSession.controller.options.wl + "</span>%");
};

OSApp.Dashboard.updateRestrictNotice = function() {
	// Swap the restriction notice displayed on the dashboard
	if ( !OSApp.currentSession.controller.settings ) {
		return;
	}
	if ( OSApp.currentSession.controller.settings?.wtrestr > 0 ) {
		$( "#restr-active" ).removeClass("hidden");
	} else {
		$( "#restr-active" ).addClass("hidden");
	}
};
