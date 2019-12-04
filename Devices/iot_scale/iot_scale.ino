#define USE_US_TIMER    // Necessary for enabling ETSTimer's microsecond accuracy

extern "C" {
#include "user_interface.h"
#include "ets_sys.h"
#include "sigma_delta.h"
}

// Custom
#include <WifiManager.h>
#include <UDPClient.h>
#include <TCPClient.h>
#include <OSCManager.h>
#include <LEDController.h>
#include <LEDPin.h>
#include "ObjectDetector.h"

// Sparkfun Load Cell Amp
#include "HX711.h"

Stream *debug = NULL;       // Use for deployment
//Stream *debug = &Serial;    // Use for testing/debugging

// WiFi, UDP, and TCP
// ==================
LEDPin wifi_led(LED_BUILTIN, 20);       // WiFi Status and UDP/TCP I/O Indicator LED
WifiManager wifi(LED_BUILTIN, debug);   // WiFi Manager
UDPClient udp_client(debug);            // UDP Client
TCPClient tcp_client(debug);            // TCP Client

// OSC
// ===
OSCManager osc(debug);                  // Open Sound Control Manager
OSCMessage outgoing_msg("/placement");  // OSC Message

// Sensing
// =======
const int PIN_CLK = D1;
const int PIN_DOUT = 10;            // GPIO10 works for input only
HX711 scale(PIN_DOUT, PIN_CLK);     // Load cell amp 
float calibration_factor = -200000; // Load cell amp calibration 
float sensor_val;                   // Current load cell value

const int EEPROM_OBJ_ARRAY_ADDR = 256;
ObjectDetector detector(EEPROM_OBJ_ARRAY_ADDR);   // Object detector 
int previous_obj_code = -2; 

// Display
// =======
LEDController rgb(&Serial);       // RGB LED strip controller
ETSTimer led_timer;               // LED render timer
const float led_rate = 45;        // LED refresh rate (Hz)

// Default RGB LED colors 
ledstate_t rgb_active(8, 8, 8, (uint32_t)(0.25 * led_rate));
ledstate_t rgb_sensing(190, 190, 255, (uint32_t)(0.5 * led_rate));
ledstate_t rgb_locked(64, 0, 0, (uint32_t)(0.5 * led_rate));

// State
// =====
// Whether this table is active/locked 
bool active = false;
bool locked = false;

// EEPROM-Stored Destination IP
// ============================
const int EEPROM_DEST_IP_ADDR = 512;
struct dest_config_t {
  char valid[8];
  char addr[32];
};
dest_config_t dest;

// Main Setup
// ==========
void setup() {
  
  Serial.begin(19200);
  EEPROM.begin(1024);
  
  // LEDs
  pinMode(LED_BUILTIN, OUTPUT);
  
  if (debug)
    Serial.println("Using serial port for debug messages. RGB LED control unavailable."); 

  // Set up scale and object detector
  scale.set_scale();
  scale.set_scale(calibration_factor);
  if (detector.load_config()) 
    scale.set_offset(detector.get_offset());
  else {
    scale.tare();
    detector.set_offset(scale.get_offset());
    detector.save_config();
  }

  // LED render timer setup
  system_timer_reinit();
  ets_timer_setfn(&led_timer, led_render, NULL);
  ets_timer_arm_new(&led_timer, 1e6/led_rate, true, 0); 
  rgb.push_state(0, 0, 0, 1);

  // Set callback function for successful connection
  wifi.set_connect_handler(wifi_connected, NULL);

  // Initilize and connect Wifi
  if (!wifi.init() || !wifi.connect()) 
      wifi.open_access_point();

  // OSC handlers
  osc.dispatch("/ping", osc_handle_ping);
  osc.dispatch("/config", osc_handle_config);
  osc.dispatch("/read", osc_handle_read);
  osc.dispatch("/tare", osc_handle_tare);
  osc.dispatch("/object", osc_handle_object);
  osc.dispatch("/activate", osc_handle_activate);
  osc.dispatch("/active", osc_handle_active);
  osc.dispatch("/led", osc_handle_led);
  osc.dispatch("/lock", osc_handle_lock);
  osc.dispatch("/revive", osc_handle_revive);
  osc.dispatch("/reset", osc_handle_reset);

  // Set UDP client data handler
  udp_client.set_data_handler(udp_handle_data, NULL);
  
  // TCP client setup
  tcp_client.set_data_handler(tcp_handle_data, NULL);
  tcp_client.set_connect_handler(tcp_handle_connect, NULL);
  // TCP client connects when we receive /ping via UDP (broadcast) 
}

// Main Loop
// =========
void loop() {
  wifi.loop();
  udp_client.loop();
  wifi_led.loop();
  if (active)
    read_scale();
}

// Sensing
// =======
/* Send scale measurements to the object detector; send OSC 
 * and animate LEDs when objects are detected or removed */
void read_scale() {
  
  sensor_val = fabs(scale.get_units());
  int obj_code = detector.process(sensor_val);
  
  if (obj_code > -2 && obj_code < kMaxNumObjects) {
    
    // Send an OSC message if we have a new object
    if (obj_code != previous_obj_code) {
      outgoing_msg.set(1, obj_code + 1);
      send_osc(outgoing_msg);
      
      previous_obj_code = obj_code;
      if (!locked) {
        if (obj_code > -1) 
          rgb.push_state(rgb_sensing);
        else
          rgb.push_state(rgb_active);
      }
    }
  }
}

// LED Render Callback
// ===================
void led_render(void *p_arg) {
  rgb.render();  
}

// WiFi Connect Handler:
// =====================
/* Connection handler; set outgoing node ID and open UDP port after connection.
   also attempt to connect via TCP to a previous destination address */
void wifi_connected(void *userdata) { 
  char node_id[32];
  wifi.get_node_id(node_id);
  outgoing_msg.set(0, atoi(node_id));
  udp_client.open_port(wifi.get_iot_port());
  if (load_dest()) {
    connect_dest(dest.addr, wifi.get_iot_port());
  }
}

// Destination IP save/load/connect:
// =================================
/* Save the destination upon successful TCP connection */
void save_dest(const char *addr, uint16_t port) {
  strcpy(dest.valid, "xyz123");
  strcpy(dest.addr, addr);
  EEPROM.put(EEPROM_DEST_IP_ADDR, dest);
  EEPROM.commit();
}

/* Attempt to load a previous destination IP from EEPROM */
bool load_dest() {
  bool success;
  EEPROM.get(EEPROM_DEST_IP_ADDR, dest);
  success = strcmp(dest.valid, "xyz123") == 0;
  return success;
}

/* Connect UDP/TCP clients to destination address and port */
void connect_dest(const char *addr, uint16_t port) {
  udp_client.connect(addr, port); 
  tcp_client.connect(addr, port);
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

/* Connection handler; send /pong */
void tcp_handle_connect(void *userdata) {
  OSCMessage response = make_pong();
  tcp_client.send(response);
  wifi_led.blink();
}

// OSC Output
// ==========
/* Send TCP if connected; fall back on UDP */
void send_osc(OSCMessage &msg) {
  if (tcp_client.connected()) 
      tcp_client.send(msg);
  else
      udp_client.send(msg, osc.remote_addr());
  wifi_led.blink();
}

// Make the '/ping' response message
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
 * Connect TCP/UDP clients to remote IP. Save remote IP as destination to EEPROM.
 * Wait for TCP connection to send /pong
 */
void osc_handle_ping(OSCMessage &msg) {  
  save_dest(udp_client.get_remote_addr().toString().c_str(), wifi.get_iot_port());
  connect_dest(udp_client.get_remote_addr().toString().c_str(), wifi.get_iot_port());
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
  send_osc(response);
}

/*  
 * /tare [float]
 * 
 * Set scale's zero weight condition (no argument). An int argument sets the offset
 * to compensate for object[idx]'s weight on the table
 */
void osc_handle_tare(OSCMessage &msg) {
  scale.tare();
  detector.set_offset(scale.get_offset());
  detector.save_config();
}

/* 
 * /object <string> <int> <float> <float>
 * 
 * Set an object's name, local index, weight (lbs), and recognition tolerance (lbs)
 *
 */
void osc_handle_object(OSCMessage &msg) {
  if (msg.isInt(0) && msg.isFloat(1) && msg.isFloat(2)) {
    detector.set_object(msg.getInt(0)-1, msg.getFloat(1), msg.getFloat(2));
  }
  detector.save_config();
}

/*
 * /activate 
 * 
 * Enable load cell object sensing and reset lock
 */
void osc_handle_activate(OSCMessage &msg) {
  rgb.push_state(rgb_active);
  active = true;
  locked = false;
}

/*
 * /active <int>
 * 
 * Enable(1)/disable(0) load cell object sensing
 */
void osc_handle_active(OSCMessage &msg) {
  if (msg.isInt(0)) {
    active = msg.getInt(0) != 0;
  }
}

/*  
 * /led <int> <int> <int> <int>
 * 
 * Cues the main LED driver to transition to the provided RGB values, in the 
 * specified number of steps.
 */
void osc_handle_led(OSCMessage &msg) {
  if (msg.isInt(0) && msg.isInt(1) && msg.isInt(2) && msg.isInt(3)) {
    rgb.push_state(msg.getInt(0), msg.getInt(1), msg.getInt(2), msg.getInt(3));
  }
}

/*
 * /lock <int>
 * 
 * 1 Animates a series of LED transitions between sensing and locked colors, and
 *     sets the panel as locked.
 * 2 (Fake lock) animates a series of LED transitions, ending with sensing
 */
void osc_handle_lock(OSCMessage &msg) {
  if (!msg.isInt(0)) 
    return;
    
  if (msg.getInt(0) == 1) {
    rgb.push_state(rgb_locked);
    rgb.push_state(rgb_sensing);
    rgb.push_state(rgb_locked);
    rgb.push_state(rgb_sensing);
    rgb.push_state(rgb_locked);
    rgb.push_state(rgb_sensing);
    rgb.push_state(rgb_locked);
    locked = true;
    
    // Send confirmation
    char p_val[32];
    OSCMessage response("/lock");
    wifi.get_config("NodeID", p_val);
    response.add(atoi(p_val));
    response.add(1);
    send_osc(response);
  }
  else if (msg.getInt(0) == 2) {
    rgb.push_state(rgb_locked);
    rgb.push_state(rgb_sensing);
    rgb.push_state(rgb_locked);
    rgb.push_state(rgb_sensing);
    rgb.push_state(rgb_locked);
    rgb.push_state(rgb_sensing);
    rgb.push_state(rgb_locked);
    rgb.push_state(rgb_sensing);
  }
}

/*
 * /revive <int>
 * 
 * Set the table to idle (0), active (1), sensing (2), or locked (3)
 */
void osc_handle_revive(OSCMessage &msg) {
  active = true;
  locked = false;
  if (msg.isInt(0)) {
    switch (msg.getInt(0)) {
      case 0:
        rgb.push_state(0, 0, 0, 1);
        active = false;
        break;
      case 1:
        rgb.push_state(rgb_active);
        break;
      case 2:
        rgb.push_state(rgb_sensing);
        break;
      case 3:
        rgb.push_state(rgb_locked);
        locked = true;
        break;
      default:
        break;
    }
  }
}

/*
 * /reset
 * 
 * Blacks out LEDs/TFT, unlocks, and deactivates
 */
void osc_handle_reset(OSCMessage &msg) {
  rgb.push_state(0, 0, 0, 1);
  locked = false;
  active = false;
}

