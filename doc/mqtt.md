# OpenSprinkler MQTT Reference

OpenSprinkler supports MQTT in three distinct modes: **publishing** status events to a broker, **receiving commands** via a subscribed topic, and **reading external sensor data** via MQTT subscriptions. No firmware modifications are required — all features are available in stock firmware 2.2.1 and later.

---

## Firmware Version Requirements

| Feature | Minimum Firmware |
|---|---|
| MQTT publish (status events) | 2.2.1 |
| MQTT subscribe (receive commands) | 2.2.1 |
| MQTT sensor subscription (read external sensors) | 2.3.1 (build 150) |
| Notification Events toggle for publish control | 2.2.1(1) |

The fork this UI targets runs firmware **2.4.0**, so all features below are available.

---

## Configuration

Navigate to **Edit Options → Integration** tab.

| Setting | Default | Notes |
|---|---|---|
| Broker / Server | — | IP address or DNS hostname of the MQTT broker |
| Port | 1883 | Adjust if broker uses a non-standard port |
| Username | — | Optional; only required if broker enforces authentication |
| Password | — | Optional; only required if broker enforces authentication |
| Publish Topic | `opensprinkler` | Prefix for all outbound messages. Max 24 characters. Use a unique name when running multiple controllers on the same broker. |
| Subscribe Topic | MAC-based name | Topic OpenSprinkler listens on for inbound commands. Leave empty to disable command subscription entirely. Max 24 characters. |

> **Tip:** Use a tool like [MQTT Explorer](https://mqtt-explorer.com/) to inspect live traffic and verify your topic structure.

---

## Published Topics

OpenSprinkler publishes events automatically when they occur. All topics follow the pattern `<publish_topic>/<subtopic>`. Publishing must be enabled per event type under **Notification Events** (firmware 2.2.1(1)+).

### System

| Topic | Payload | Triggered by |
|---|---|---|
| `opensprinkler/system` | `{"state":"started"}` | Controller boot / reboot |
| `opensprinkler/availability` | `online` or `offline` (plain text, not JSON) | Connection established / lost |

> Clients that require strict JSON should filter or ignore the availability topic.

### Programs

| Topic | Payload | Notes |
|---|---|---|
| `opensprinkler/program/<n>` | `{"state":1,"wl":<percent>}` | Program `n` started; `wl` is the current water level percentage |
| `opensprinkler/program/<n>` | `{"state":"skipped","wtrestr":<x>}` | Program skipped due to weather restriction |

### Stations / Zones

| Topic | Payload | Notes |
|---|---|---|
| `opensprinkler/station/<n>` | `{"state":1,"duration":<seconds>}` | Station `n` opened |
| `opensprinkler/station/<n>` | `{"state":0,"duration":<seconds_ran>}` | Station `n` closed |
| `opensprinkler/master/pump` | `{"state":1}` | Master / pump station activated (duration omitted) |

### Sensors

| Topic | Payload | Notes |
|---|---|---|
| `opensprinkler/sensor1` | `{"state":1}` or `{"state":0}` | Sensor 1 activated / deactivated |
| `opensprinkler/sensor2` | `{"state":1}` or `{"state":0}` | Sensor 2 activated / deactivated |
| `opensprinkler/sensor/flow` | `{"count":<pulses>,"volume":<litres>}` | Flow sensor reading |

### Alerts

| Topic | Payload | Notes |
|---|---|---|
| `opensprinkler/alert/flow` | Alert notification | Abnormal flow detected (firmware 2.2.1(1)+) |
| `opensprinkler/station/<n>/alert/curr` | `{"curr_value":<x>,"imin_threshold":<t>}` or `{"curr_value":<x>,"imax_limit":<t>}` | Station current under/over threshold |
| `opensprinkler/overcurrent` | Alert notification | System-level overcurrent |

### Weather

| Topic | Payload |
|---|---|
| `opensprinkler/raindelay` | State change message |
| `opensprinkler/weather` | `{"water level":<percent>%}` |

---

## Inbound Commands (Subscribe Topic)

OpenSprinkler listens on its **Subscribe Topic** for commands. Commands mirror the HTTP API format — the same syntax you would use in a browser URL or HTTP request works as an MQTT message payload.

### Format

```
<endpoint>?pw=<md5_password>&<param1>=<value>&<param2>=<value>
```

- `pw` must be the **MD5 hash** of the device password (not the plaintext password).
- If the device has no password set, use `pw=` (empty after the equals sign).

### Supported Endpoints

#### `cv` — Change Controller Variables

Adjust global controller state.

| Parameter | Value | Effect |
|---|---|---|
| `rsn` | `1` | Stop all running and queued stations immediately |
| `rbt` | `1` | Reboot the controller |
| `en` | `0` or `1` | Disable / enable the controller |
| `rd` | `<hours>` | Set rain delay (0–32767 hours; `0` clears it) |

#### `cm` — Manual Station Run

Open or close a single station.

| Parameter | Value | Notes |
|---|---|---|
| `sid` | `<index>` | Station index, zero-based |
| `en` | `1` or `0` | `1` = open, `0` = close |
| `t` | `<seconds>` | Duration; required when `en=1` |
| `qo` | `0` or `1` | Queue option: `0` = append, `1` = insert ahead of current |

#### `mp` — Start Program

Trigger an existing program by index.

| Parameter | Value | Notes |
|---|---|---|
| `pid` | `<index>` | Program index, zero-based |
| `uwt` | `0` or `1` | `1` = apply current water level; `0` = run at 100% |
| `qo` | `0`, `1`, or `2` | `0` = append, `1` = insert at front, `2` = replace current |

#### `cr` — Run-Once Program

Execute a custom one-off schedule across all stations.

| Parameter | Value | Notes |
|---|---|---|
| `t` | `[s0,s1,…,sN]` | Array of per-station durations in seconds; `0` skips a station |
| `cnt` | `<n>` | Number of times to repeat |
| `int` | `<minutes>` | Interval between repeats |
| `uwt` | `0` or `1` | Apply weather adjustment |
| `qo` | `0`, `1`, or `2` | Queue option (same as `mp`) |

### Command Examples

```bash
# Stop all stations
mosquitto_pub -h <broker_ip> -t <subscribe_topic> -m "cv?pw=<md5>&rsn=1"

# Run station 0 (first zone) for 5 minutes
mosquitto_pub -h <broker_ip> -t <subscribe_topic> -m "cm?pw=<md5>&sid=0&en=1&t=300"

# Close station 0 immediately
mosquitto_pub -h <broker_ip> -t <subscribe_topic> -m "cm?pw=<md5>&sid=0&en=0"

# Start program 1 (index 0) with weather adjustment applied
mosquitto_pub -h <broker_ip> -t <subscribe_topic> -m "mp?pw=<md5>&pid=0&uwt=1"

# Set a 24-hour rain delay
mosquitto_pub -h <broker_ip> -t <subscribe_topic> -m "cv?pw=<md5>&rd=24"

# Reboot the controller
mosquitto_pub -h <broker_ip> -t <subscribe_topic> -m "cv?pw=<md5>&rbt=1"
```

> **Generating the MD5 hash:** On Linux/macOS: `echo -n "yourpassword" | md5sum`  
> On Windows (PowerShell): `(Get-FileHash -Algorithm MD5 ([System.Text.Encoding]::UTF8.GetBytes("yourpassword"))).Hash.ToLower()`

---

## MQTT Sensor Subscriptions

Since firmware **2.3.1 (build 150)**, OpenSprinkler can subscribe to external MQTT topics and treat the received values as sensor readings. This allows soil moisture sensors, weather stations, LoRaWAN nodes, or any device publishing to an MQTT broker to influence irrigation decisions — without any external automation layer.

### How It Works

1. An external device (e.g. a soil moisture sensor via LoRaWAN/NB-IoT gateway) publishes readings to your MQTT broker.
2. OpenSprinkler subscribes to that topic and extracts a numeric value.
3. The value is mapped to a **watering level percentage** (0–200%) that scales all program run times.
4. At 0%, watering is effectively paused. At 100%, schedules run as programmed. Above 100%, run times are extended.

### Configuration

Go to **Sensors → Add Sensor** and set type to **MQTT Subscription**.

| Field | Description |
|---|---|
| **Topic** | The full MQTT topic path the external sensor publishes to (e.g. `application/1/device/abc123/event/up`) |
| **Filter** | The field name to extract from the JSON payload (e.g. `soilMoisture`). Leave empty if the payload is a plain numeric value. |

Use [MQTT Explorer](https://mqtt-explorer.com/) to browse live topics and identify the correct path and field name. Many LoRaWAN sensors transmit only every 10–15 minutes, so allow time for a packet to arrive.

### Example: Shelly Voltmeter as a Pressure Sensor

Shelly devices publish JSON payloads to topics like `shelly/<location>/events`. The payload is nested:

```json
{
  "params": {
    "voltmeter:200": {
      "id": 200,
      "voltage": 2.14,
      "xvoltage": 4.18
    }
  }
}
```

In this setup `xvoltage` carries the pressure in bar (calculated from voltage by the Shelly firmware). OpenSprinkler's recursive JSON field search will find `xvoltage` anywhere in the payload tree.

| Field | Value |
|---|---|
| **Topic** | `shelly/garage/pumpe/druck/events` |
| **Filter** | `xvoltage` |
| **Name** | Wasserdruck |
| **Unit** | bar |
| **Show on Dashboard** | ✓ |

After saving, navigate to the Dashboard — the sensor tile will appear alongside the station grid, updating each time the Shelly publishes a new reading (typically every 10–60 seconds).

### Mapping Sensor Values to Watering

The raw sensor value becomes the watering level percentage directly. To control the behaviour you want, configure the sensor's min/max scaling in the sensor settings:

| Soil Moisture Reading | Desired Watering Level | Effect |
|---|---|---|
| High (soil wet, e.g. >40%) | 0% | No watering |
| Medium (e.g. 20–40%) | 50% | Half duration |
| Low (soil dry, e.g. <10%) | 100–150% | Full or extended duration |

The example from the OpenSprinkler documentation targets a moisture band of 10–20%, adjusting the watering level between 0% and 200% accordingly.

---

## Automation Patterns

### Pattern 1: Simple moisture guard (no external system needed)

Set up an MQTT Subscription sensor. When the sensor reports soil is saturated, the watering level drops to 0% and scheduled programs run for 0 seconds — effectively skipped. No external automation needed.

**Suitable for:** "Don't water when already wet."

### Pattern 2: Threshold-triggered runs (Node-RED / Home Assistant)

For conditional logic ("run Program 2 for 10 minutes only if moisture is below 20%"), add a middle layer:

1. **Node-RED / HA** subscribes to your soil moisture sensor topic.
2. It evaluates the threshold.
3. On trigger, it publishes an `mp` or `cm` command to OpenSprinkler's subscribe topic.

**Node-RED example flow (simplified):**
```
[MQTT in: sensor/soil/moisture]
  → [Function: if (msg.payload < 20) return msg]
  → [MQTT out: opensprinkler_subscribe_topic]
       payload: "mp?pw=<md5>&pid=1&uwt=0"
```

**Suitable for:** Fine-grained conditional program control, multi-sensor logic, time-of-day guards.

### Pattern 3: Home Assistant integration

Add OpenSprinkler as an MQTT device in HA. The published topics map to sensor and switch entities. HA automations can then publish commands back to the subscribe topic based on any HA condition (weather, calendar, presence, etc.).

---

## Limitations

- Subscribe and publish topic names are each limited to **24 characters**.
- Only a subset of HTTP API endpoints are supported via MQTT (see above); endpoints like `/jl` (log query) cannot be triggered this way.
- The MQTT Sensor Subscription feature adjusts the global water level percentage — it does not directly trigger or stop individual programs. For conditional program logic, use Pattern 2 above.
- The availability topic (`online`/`offline`) is plain text, not JSON — handle it separately if your broker client expects strict JSON.
- Publishing must be explicitly enabled per event type in Notification Events (firmware 2.2.1(1)+); no events are published by default.
