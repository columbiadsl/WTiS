# WTiS-StateMachine

This system controls video and audio playback, driven by audience interactions sensed by IoT devices, which communicate with the main computer using Open Sound Control (OSC) messages via UDP and TCP socket connections. 

It has been implemented and tested using Max 8.0.5 and Python 3.7.3 in Mac OS 10.14.

## Installation

**Max/MSP**
Download the repository and place the directory `Max/wtis` in your Max library folder (`~/Documents/Max 8/Library`)

**Python**

1. Make sure pip3 is up to date
`>> sudo pip3 install --upgrade pip`

2. Install python-osc
`>> sudo pip3 install python-osc`

3. Test the tcp.py script
`>> python3 tcp.py`

If you get the error `gaierror: [Errno 8] nodename nor servname provided, or not known`, do the following:

1. Copy the name of the computer from one of the terminal input lines (`computer_name:current_directory admin$`)

2. Open the /etc/hosts file in nano (other text editors will deny permission to modify)
`>> sudo nano /etc/hosts`

3. Add an alias for `127.0.0.1` to the computer's name:
- arrow down to the line `127.0.0.1 locahost` and insert a new line
- add the line `127.0.0.1 computer_name` (no quotes, pasting the actual computer's name that you got from the terminal)

4. Re-run the `tcp.py` script

## Usage

1. Open the main patch in `Max/main.maxpat`  
2. Run the Python script in `Python/tcp.py`
3. Switch main patch to presentation mode and follow remaining instructions for configuring the IoT devices. 

*Note: be sure to use the Max console to monitor the connection of any IoT devices and behavior of the state machine.*

### Assets

This project depends on a set of audio and video assets which are not included in this repository. The contents of the project's assets directory should be placed in the `Max` directory before attempting to run the state machine. 

## Principles of Operation

## IoT Device Communication

The IoT sensors used in this project communicate using OSC messages sent over both UDP and TCP sockets. UDP is implemented natively in Max, but the native TCP objects are inappropriate for maintaining open connections with the devices. 

TCP connections on the computer side are managed by a Python script in `Python/tcp.py`, which connects to Max via local UDP port (port 9000, in `main.maxpat`). This link between Max and Python is managed by `Max/wtis/devmanager.js`, so OSC messages can be sent to devices by preceding the message with the device ID and node ID (e.g. `table 2 /activate`, `table 1 /led 255 255 255`). 

The IoT devices are designed to attempt a TCP connection with their last destination address. If this fails, they open a UDP port, and a button in `main.maxpat` can send a 'ping' via UDP which causes the IoT devices to initiate TCP connections. The UDP ping can be used for initial configuration, whereas any subsequent setups of the system (when IP addresses haven't changed) will only involve starting the Python script, opening the Max patch, powering on the IoT devices, and waiting for them to reconnect.

### State Machine
The project's main state machine code is implemented in `Max/main.js`, which uses the state machine back-end defined in `/Max/wtis/statemachine.js`. The `main.js` file controls states and transitions using a mix of behavior defined in two CSV files (detailed below) and custom code. 

#### States and Actions
The possible states are defined in `Max/sm/states.csv`. Each state is defined with a set of actions, or OSC messages that it sends to the asset controllers (audio, video, and image grid) and timer (for automatic state transitions on a delay). 

#### Conditions
The state machine transitions between states based on the value of conditions, which are modeled as arrays of integers with an associated OSC path, and defined in the top row of `/Max/sm/transitions.csv`. These conditions are updated using OSC messages sent to the state machine by IoT devices and asset controllers.

**Example:** `/retrieval 4` indicates that there are four possible object retrievals, and an OSC message of `/retrieval 3 1` sent to the state machine from an IoT object sensor sets the third value in the retrievals array to 1.

#### Transitions (Basic)
State to state transition are partially defined in `transitions.csv`. Each row defines an initial and destination state and a value of a condition array that should trigger the transition.

**Example:** `EQUAL 0 0 1 0` under the `/retrieval` column transitions when the third object has been retrieved. 

This custom transition syntax may include wildcard values using `*`, negations using `~`, and multiple conditions (implementing a logical AND) separated using `;`. Logical OR can be implemented by duplicating the transition on an additional row. 

*Note: to see how transitions defined in the CSV file are parsed, see the `Condition` class defined in `/Max/wtis/statemachine.js`.*

#### Actions and Transitions (Advanced)

Any function in `main.js` named after a state defined in `states.csv`, preceded by `begin_` or `end_` will be called by the state machine when that state begins or ends. These functions are used to generate actions which depend on complex logical conditions or random number generation. 

Any function in `main.js` named after a state, preceded by `update_` is called by the state machine during that state whenever any condition changes. This function can return nothing to remain in the state, or return the name of another state to transition to it. 

See `main.js` for examples. 

### Asset Controllers

The asset controllers defined in `Max/wtis/asset_controllers` standardize the interface to Max's native video and audio player objects, allowing OSC actions defined in `states.csv` to control video and audio playback (starting, stopping, and looping). 

The OSC message should have a path containing the asset directory, followed by up to three numerical values representing the number of the audio file, whether it's starting (1) or stopping (0), and whether we want to loop (1) or play once (0).

**Example:** an action of `/audio/burn/score1 2 1` plays the second audio file in the directory `Max/audio/burn/score1` once. `/audio/burn/score1 2 1 1` loops the file, and `/audio/burn/score1 2 0` stops the file if it's playing. `/audio/burn/score1 0` stops any file playing on the directory's audio channel.

The asset controllers send end-of-file (EOF) messages back to the state machine which it can use as conditions to transition states after assets have played (e.g. `/warning 2 1` plays the second video in `Max/warning`, and the `videoctrl.js` object sends `/warning 2 1` back to the state machine to indicate this video has played.

*Note: `videoctrl.js` is designed to control a single video player instance using videos in a number of directories, specified to the Max `[js]` object as a list of arguments, whereas `audioctrl.js` is designed to control one audio player/channel using files in a single directory specified to the Max `[js]` object as an argument (see `Max/wtis_audio.maxpat`)*






