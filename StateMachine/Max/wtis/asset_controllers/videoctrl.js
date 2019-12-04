/* ------------------------------------------------------------------------
 * videoctrl.js
 *
 * Front-end interface for controlling jit.qt.movie instances using a 
 * standardized OSC message protocol.
 *
 * Use with a sub-folder of video clips, numbered 1, ..., N
 * 
 * -------- Jeff Gregorio, 2019 -------------------------------------------
 *
 * Usage: 
 *	[js videoctrl.js [file_ext]]
 *
 * Examples:
 *	[js videoctrl.js video mp4]
 *
 * Responds to OSC messages conforming to:
 * 	/[assetfolder] [clip #] [start/stop] [one-shot/loop]	
 *
 * Examples:
 *
 * Play clip 3 (one shot):
 * 	/video 3					
 * 	/video 3 1
 *	/video 3 1 0
 *	
 * Play clip 3 (loop):
 *	/video 3 1 1
 *
 * Stop clip 3 (if it's playing):
 * 	/video 3 0
 * 
 * Stop current clip:
 * 	/video 0
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

// Default file extension
// var fileext = 'mp4';
var oscpath;

// // Check for specified file extension
// if (jsarguments.length > 1) {
// 	fileext = jsarguments[1];
// }

var file_dict = get_file_dict(jsarguments.slice(1));

// for (var i = 1; i < jsarguments.length; i++) {

// 	// Create a dict entry for this directory
// 	oscpath = jsarguments[i];
// 	file_dict[oscpath] = {};

// 	// Get the full path to the directory
// 	var assetpath = fullpath(oscpath);

// 	// Assign a cue number to each file in the directory
// 	var cue_num = 1;
// 	var adir = new Folder(assetpath);
// 	while (!adir.end) {
// 		if (adir.filetype != '') {
// 			file_dict[oscpath][cue_num] = assetpath + '/' + adir.filename;
// 			cue_num++;
// 		}
// 		adir.next();
// 	}
// 	adir.close();
// }

// for (var dname in file_dict) {
// 	if (file_dict.hasOwnProperty(dname)) {
// 		for (var fname in file_dict[dname]) {
// 			if (file_dict[dname].hasOwnProperty(fname)) {
// 				// post("Assigning " + file_dict[dname][fname] + ' to cue:\n');
// 				post(dname + ' ' + fname + '\n');
// 			}
// 		}
// 	}
// }


// // Parse second argument
// if (jsarguments.length > 1) {

// 	// Store relative path as the expected incoming osc
// 	oscpath = jsarguments[1];
// 	var assetpath = fullpath(oscpath);

// 	// Store full paths to all asset files in file_dict
// 	var adir = new Folder(assetpath);
// 	while (!adir.end) {
// 		if (adir.filetype != '') 
// 			file_dict.push(assetpath + '/' + adir.filename);
// 		adir.next();
// 	}
// 	adir.close();
// }

// Main message handler
function anything() {
	// Treat any string start with a slash as an OSC message
	if (messagename.charAt(0) == '/') {
		if (ac.handle_osc(messagename, arguments)) {
			oscpath = messagename;
		}
	}
}

// Handle kill 
function kill() {
	ac.kill();
}

// Treat bang as EOF
function bang() {
	ac.eof_in();
}

// Advance the state machine by stopping the clip and sending the EOF update
function advance() {
	ac.advance();
}

// Stop the clip
function stop() {
	ctlout_stop();
}

// Video control output handlers:
// ------------------------------
// Set loop mode 
function ctlout_loop(do_loop) {
	outlet(0, 'loop', do_loop);
}

// Start clip
function ctlout_start(oscpath, clipnum) {
	outlet(0, 'read', file_dict[oscpath][clipnum]);
	// outlet(1, oscpath + ' ' + clipnum);
	// outlet(0, 'read', fullpath(oscpath, clipnum, fileext));
}

// Stop clip
function ctlout_stop() {
	outlet(0, 'dispose');
	// outlet(1, 'none');
}

// Advance the clip (jit.qt.movie sends EOF)
function ctlout_advance(clipnum) {
	outlet(0, 'stop');
	// outlet(1, 'none');
	// outlet(0, 'dispose');
}

// Sends an OSC message to the state machine, flagging this clip as played
function ctlout_eof(clipnum) {
	outlet(1, oscpath, clipnum, 1);
}

