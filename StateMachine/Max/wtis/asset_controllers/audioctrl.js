/* ------------------------------------------------------------------------
 * audioctrl.js
 *
 * Front-end interface for controlling sfplay~ instances using a 
 * standardized OSC message protocol.
 *
 * Use with a sub-folder of audio clips, numbered 1, ..., N
 * 
 * -------- Jeff Gregorio, 2019 -------------------------------------------
 *
 * Usage: 
 *	[js audioctrl.js [assetfolder]]
 *
 * Example:
 *  [js assetctrl.js audio /assets/audio]
 *
 * Responds to OSC messages conforming to:
 * 	/[assetfolder] [clip #] [start/stop] [one-shot/loop]	
 *
 * Examples:
 *
 * Play clip 3 (one shot):
 * 	/assets/audio 3					
 * 	/assets/audio 3 1
 *	/assets/audio 3 1 0
 *	
 * Play clip 3 (loop):
 *	/assets/audio 3 1 1
 *
 * Stop clip 3 (if it's playing):
 * 	/assets/audio 3 0
 * 
 * Stop current clip:
 * 	/assets/audio 0
 *
 */

include("wtis_pathutil");
include("assetctrl");

// Main 
// ====
inlets = 1;
outlets = 2;

// Universal audio/video asset controller
var ac = AssetController(
	ctlout_loop,		// Loop
	ctlout_start,		// Start
	ctlout_stop,		// Stop
	ctlout_advance,		// Advance
	ctlout_eof);		// EOF

var oscpath;		// Relative path to assets directory 

// Parse provided directory and preload cues
var file_dict = get_file_dict(jsarguments.slice(1));
ctlout_preload(file_dict);

// Main OSC message handler
function anything() {
	if (messagename == oscpath) 
		ac.handle_osc(messagename, arguments);
}

// Preload files on loadbang or init
function loadbang() {
	ctlout_preload(file_dict);
}

function init() {
	ctlout_preload(file_dict);
}

// Handle Kill
function kill() {
	ac.kill();
}

// Treat bang as EOF
function bang() {
	ac.eof_in();
}

// Advance the state machine by stopping the clip and sending the EOF update
function advance() {
	ctlout_stop();	// sfplay~ sends EOF on stop
}

// Stop the clip
function stop() {
	ctlout_stop();
}

// Audio control output handlers:
// ------------------------------
// Set loop mode (same message for audio and video players)
function ctlout_loop(do_loop) {
	outlet(0, 'loop', do_loop);
}

// Start clip 
function ctlout_start(oscpath, clipnum) {
	outlet(0, Number(clipnum) + 1);
}

// Stop clip 
function ctlout_stop() {
	outlet(0, 0);
}

// Advance the clip (sfplay~ doesn't send EOF when one file is interrupted
// with another, so we have to fake it)
function ctlout_advance(clipnum) {
	// ctlout_stop();
	ctlout_eof(clipnum);
}

// Sends an OSC message to the state machine, flagging this clip as played
function ctlout_eof(clipnum) {
	outlet(1, oscpath, clipnum, 1);
}

// Preload audio clips in the specified assets path. Each clip is set to its 
// number + 1, since sfplay~ plays whatever file is currently loaded on cue 1
function ctlout_preload(dict) {	
	outlet(0, 'clear');
	for (var dname in dict) {
		if (dict.hasOwnProperty(dname)) {
			for (var cue_num in dict[dname]) {
				if (dict[dname].hasOwnProperty(cue_num)) {
					sfplay_cue = Number(cue_num)+1;
					// post(dname + ' ' + cue_num + '\n')
					// post("preloading file " + dname + ' ' + cue_num + " as cue " + sfplay_cue + '\n');
					outlet(0, 'preload', sfplay_cue, dict[dname][cue_num], 0);
				}
			}
		}
	}
}