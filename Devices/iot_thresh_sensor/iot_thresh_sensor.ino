#define USE_US_TIMER    // Necessary for enabling ETSTimer's microsecond accuracy

extern "C" {
#include "user_interface.h"
#include "ets_sys.h"
#include "sigma_delta.h"
}

#include <WifiManager.h>
#include <UDPClient.h>
#include <TCPClient.h>
#include <OSCManager.h>
#include <Gate.h>
#include <LEDPin.h>

Stream *debug = NULL;       // Uncomment for deployment
//Stream *debug = &Serial;    // Uncomment for testing/debugging

// WiFi, UDP, and TCP
// ==================
LEDPin wifi_led(LED_BUILTIN, 20);       // WiFi Status and UDP/TCP I/O Indicator LED
WifiManager wifi(LED_BUILTIN, debug);   // WiFi Manager
UDPClient udp_client(debug);            // UDP Client
TCPClient tcp_client(debug);            // TCP Client

// OSC
// ===
OSCManager osc(debug);                  // Open Sound Control Manager
OSCMessage outgoing_msg("/retrieval");  // OSC Message

// Sensing
// =======
ETSTimer sample_timer;                          // Sensor sample timer
const float sample_rate = 10;                   // Sensor sample rate (Hz)
const float sample_period = 1e6 / sample_rate;  // Sensor sample period (microseconds)
uint16_t sensor_val;                            // Current sensor value

// Gate (converts analog input to HIGH/LOW with configurable hysteresis thresholds)
const int EEPROM_GATE_CAL_ADDR = 512;      
Gate gate(400, 650, EEPROM_GATE_CAL_ADDR, debug);

// Main Setup
// ==========
void setup() {

  // I/O setup
  if (debug) 
    Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(A0, INPUT_PULLUP);
  
  // Set callback function for successful connection
  wifi.set_connect_handler(wifi_connected, NULL);
  
  // Initilize and connect Wifi or open access point
  if (!wifi.init() || !wifi.connect()) 
      wifi.open_access_point(); 

  // Set OSC handlers
  osc.dispatch("/ping", osc_handle_ping);
  osc.dispatch("/config", osc_handle_config);
  osc.dispatch("/read", osc_handle_read);
  osc.dispatch("/calibrate", osc_handle_calibrate);

  // Set UDP client data handler
  udp_client.set_data_handler(udp_handle_data, NULL);
  
  // Set TCP client data and connection handlers
  tcp_client.set_data_handler(tcp_handle_data, NULL);
  tcp_client.set_connect_handler(tcp_handle_connect, NULL);
  // (TCP client connects when we receive /ping via UDP (broadcast)))

  // Gate setup
  gate.init();

  // Sensor sampling timer setup
  system_timer_reinit();
  ets_timer_setfn(&sample_timer, sample_sensor, NULL);
  ets_timer_arm_new(&sample_timer, sample_period, true, 0);  
}

// Main Loop
// =========
void loop() {
  wifi.loop();
  udp_client.loop();
  wifi_led.loop();
}

// Sensor Sampling
// ===============
/* Read sensor; threshold and send OSC on state changes */
void sample_sensor(void *p_arg) {
  sensor_val = analogRead(A0);
  if (gate.process(sensor_val)) {
    outgoing_msg.set(1, gate.get_state());
    osc_send(outgoing_msg);    
  }
}

// WiFi Connect Handler:
// =====================
/* Connection handler; set outgoing node ID and open UDP port after connection */
void wifi_connected(void *userdata) { 
  char node_id[32];
  wifi.get_node_id(node_id);
  outgoing_msg.set(0, atoi(node_id));
  udp_client.open_port(wifi.get_iot_port());
}

// UDP Data Handler
// ================
/* Pass raw data to OSC manager for decoding/dispatching */
void udp_handle_data(uint8_t *data, size_t len, void *userdata) {
  osc.handle_buffer(data, len);
  wifi_led.blink();
}

// TCP Handlers
// ============
/* Data handler; pass raw data to OSC manager for decoding/dispatching */
void tcp_handle_data(uint8_t *data, size_t len, void *userdata) {
  osc.handle_buffer(data, len);
  wifi_led.blink();
}

/* Connection handler */
void tcp_handle_connect(void *userdata) {
  OSCMessage response = make_pong();
  tcp_client.send(response);
  wifi_led.blink();
}

// OSC Output
// ==========
/* Send TCP if connected; fall back on UDP */
void osc_send(OSCMessage &msg) {
  if (tcp_client.connected()) 
      tcp_client.send(msg);
  else
      udp_client.send(msg, udp_client.get_remote_addr());
  wifi_led.blink();
}

/* Make the '/ping' response message */
OSCMessage make_pong() {
  char buff[32];
  OSCMessage response("/pong");
  wifi.get_dev_id(buff);
  response.add(buff);
  wifi.get_node_id(buff);
  response.add(atoi(buff));
  response.add(wifi.get_local_address().toString().c_str());
  return response;
}

// OSC Message Handlers
// ====================
/* 
 * /ping
 *  
 * Connect TCP/UDP clients to remote IP. Wait for TCP connection to send /pong
 */
void osc_handle_ping(OSCMessage &msg) {  
  tcp_client.connect(udp_client.get_remote_addr().toString().c_str(), wifi.get_iot_port());
  udp_client.connect(udp_client.get_remote_addr().toString().c_str(), wifi.get_iot_port());
}

/*
 * /config
 * 
 * Disconnect WiFI and open access point
 */
void osc_handle_config(OSCMessage &msg) {
  wifi.open_access_point();
}

/*
 * /read
 * 
 * Respond with current sensor reading
 */
void osc_handle_read(OSCMessage &msg) {
  char p_val[32];
  OSCMessage response("/reading");
  wifi.get_config("DevID", p_val);
  response.add(p_val);
  wifi.get_config("NodeID", p_val);
  response.add(atoi(p_val));
  response.add(sensor_val);
  osc_send(response);
}

/*
 * /calibrate <int>
 * 
 * Calibrate sensor gate thresholds; min (0) or max (1)
 */
void osc_handle_calibrate(OSCMessage &msg) {
  if (!msg.isInt(0))
    return;
  if (msg.getInt(0) == 0)
    gate.calibrate_min(); 
  else if (msg.getInt(0) == 1)
    gate.calibrate_max();
}
