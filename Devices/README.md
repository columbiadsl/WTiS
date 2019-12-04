# Devices

This directory contains C/C++ code for all embedded (IoT and non-IoT) devices used in Where There is Smoke. 

The three IoT projects are designed to run on the NodeMCU microcontroller. The code contained in `libiot` simplifies the design of IoT-based sensors by handling connection to WiFi networks and Open Sound Control (OSC) messages sent over UDP or TCP connections. Devices using this library will store wifi credentials, and automatically connect to their most recent network when powered on. If this fails they open an access point with a captive configuration portal where you can enter wifi credentials, device identifiers, and UDP/TCP port numbers.

*Note: these devices transmit and store wifi credentials on the device without encryption, so do not use these devices on networks that require any measure of security. It is preferable to use a dedicated router with no internet connection.*

The `arcade` project runs on a Teensy 3.6 and uses the [Teensy Audio library](https://www.pjrc.com/teensy/td_libs_Audio.html).

The `led_driver` example runs on an ATTiny85, and is designed to receive a three-byte serial message from the `iot_scale` device. These three bytes sets the color of an LED strip via PWM outputs. Note this separate LED driver device may be unnecessary in versions of `iot_scale` which omit the TFT screen, since PWM pins on the NodeMCU will be available to drive LEDs.

## Arduino Library Installation

To install, move the `libiot` directory to the Arduino libraries directory (`~/Documents/Arduino/libraries`). You will then be able to access a simplified example IoT device within the Arduino IDE by going to `File->Examples->libiot->gate`.

### Dependencies

#### esp8266 boards package

1. Open Arduino Preferences
1. Under 'Additional Boards Manager URLs', enter the following URL: http://arduino.esp8266.com/stable/package_esp8266com_index.json
1. Open the Boards Manager under Tools->Board->Boards Manager
1. Search 'esp8266' and install

#### [esp8266 USB Driver](https://www.silabs.com/products/development-tools/software/usb-to-uart-bridge-vcp-drivers)

Note: OS X will block the installation of the driver, which you can enable (after begining the driver installation) in System Preferences->Security & Privacy.

#### Libraries 
* [esp8266-OSC](https://github.com/sandeepmistry/esp8266-OSC)
* [ESPAsyncTCP](https://github.com/me-no-dev/ESPAsyncTCP)

## Example Project

The `gate` example monitors the state of pin digital pin D1 on the NodeMCU, and sends `/gate <node_id> 1` when the pin goes high, and `/gate <node_id> 0` when the pin goes low, where `<node_id>` is the device's configured node ID number, allowing multiple `/gate` messages to be disambiguated.

The following image shows how to connect an [A3144](https://www.amazon.com/A3144E-OH3144E-Effect-Sensor-Three-pin/dp/B01M2WASFL) or similar Hall effect sensor to pin D1 with a 10k pullup resistor. This will sense the presence of a magnet when the field is oriented correctly.

<img src="images/hall_gate.jpg" width="400">

### Device Configuration

The node ID number, along with a device ID can be set on the device's configuration portal. To access the portal, program the device and wait for it to attempt to connect to a wifi network (during which the onboard LED will blink slowly). It will fail to connect, as it initially has no wifi credentials. When the LED turns off, check your list of networks for `ap-device-1`, and connect to it with the password `iotconfig`. 

You will then be prompted with a captive portal, where you may enter the name of a wifi network and password, as well as a device identifier, node identifier, and UDP/TCP port number to use. 

*Note: on some machines, the captive portal does not open or disappears quickly, so you may need to attempt to use different devices (including mobile phones).*
