#include <SoftwareSerial.h>

const int PIN_R = 4;  // Physical pin 3
const int PIN_G = 0;  // Physical pin 5
const int PIN_B = 1;  // Physical pin 6
const int PIN_RX = 3; // Physical pin 2
const int PIN_TX = 2; // Physical pin 7
SoftwareSerial serial(PIN_RX, PIN_TX);

// Serial input format: three intgers separated by white space, 
// terminated by carraige return
String line;  // Input string 
int idx = 0;  // Token count
int rgb[3];   // RGB values

void setup() {
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  pinMode(PIN_TX, OUTPUT);
  pinMode(PIN_RX, INPUT);
  serial.begin(19200);
}

void loop() {
  
  while (serial.available()) {

    // Read until a carraige return
    line = serial.readStringUntil('\r');

    // Tokenize by white space; interpret first three tokens as integers
    // representing RGB values; count total number of tokens
    char *token;
    token = strtok(line.c_str(), " ");    
    while (token != NULL) {
      if (idx < 3)
        sscanf(token, "%d", &rgb[idx]);
      idx++;
      token = strtok(NULL, " ");
    }

    // If we have three tokens
    if (idx == 3) {
      // Constrain RGB values to [0, 255]
      for (int i = 0; i < 3; i++) {
        rgb[i] = rgb[i] < 0 ? 0 : rgb[i];
        rgb[i] = rgb[i] > 255 ? 255 : rgb[i];
      }
      analogWrite(PIN_R, rgb[0]);
      analogWrite(PIN_G, rgb[1]);
      analogWrite(PIN_B, rgb[2]);
    }
    
    line = "";
    idx = 0;
  }
}

