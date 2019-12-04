/* ------------------------------------------------------------------------
 * assetctrl.js
 *
 * Front-end interface for controlling jit.qt.movie or sfplay~ instances
 * using a standardized OSC message protocol.
 *
 * Use with a sub-folder of video/audio clips, numbered 1, ..., N
 * 
 * -------- Jeff Gregorio, 2019 -------------------------------------------
 *
 * Usage: 
 *	[js assetctrl.js [video/audio] [file_ext/assetpath]]
 *
 * Examples:
 *	[js assetctrl.js video mp4]
 *  [js assetctrl.js audio /assets/audio]
 *
 * Responds to OSC messages conforming to:
 * 	/assetfolder [clip #] [start/stop] [one-shot/loop]	
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

include("pathutil");

// Main 
// ====
inlets = 1;
outlets = 2;

// Default number of clips
var numclips = 1;

var assetpath = '';
var fnames = [];

// Default to video type (for controlling jit.qt.movie instance)
var ctltype = 'video';
var fileext = 'mp4';
var eofmsg_v = 'loopnotify';
var ctlout_preload = null;
var ctlout_start = ctlout_start_v;
var ctlout_stop = ctlout_stop_v;
var ctlout_advance = ctlout_advance_v;

// Check for audio type (for controlling sfplay~ instance)
if (jsarguments.length > 1 && jsarguments[1] === 'audio') {
	ctltype = 'audio';
	fileext = 'wav';
	eofmsg_v = null;
	ctlout_preload = ctlout_preload_a;
	ctlout_start = ctlout_start_a;
	ctlout_stop = ctlout_stop_a;
	ctlout_advance = ctlout_stop_a;	// sfplay~ EOF sends bang on stop
}

// Parse second argument
if (jsarguments.length > 2) {

	// Get video file extension
	if (ctltype == 'video') {
		fileext = jsarguments[2];
	}
	// Get path to audio assets and preload as numbered cues
	else if (ctltype == 'audio') { 

		// Get asset directory path
		assetpath = fullpath(jsarguments[2]);

		// Store full paths to all asset files in fnames
		var adir = new Folder(assetpath);
		while (!adir.end) {
			if (adir.filetype != '') 
				fnames.push(assetpath + '/' + adir.filename);
			adir.next();
		}
		adir.close();

		// Preload clips as numbered cues
		ctlout_preload_a(fnames);
	}
}

// Previous values
var path;		// OSC path (same name as asset folder path)
var clip = 0;	// Clip number
var start = 0;	// Whether to start or stop
var loop = 0;	// Whether to loop

// Main message handler
function anything() {
	// Treat any string start with a slash as an OSC message
	if (messagename.charAt(0) == '/') 
		handleOSC(messagename, arguments);
}

// Handle kill message:
// Stop the current asset, but first set the clip number to zero so the EOF
// kicked back from the (audio) player is ignored and we don't update the state
// machine. If the state machine is sending 'kill' after a reset, at this point, 
// it will already have cleared all flags, so we don't want to touch them. 
function kill() {
	clip = 0; 
	ctlout_stop();
}

// Treat bang as EOF
function bang() {
	ctlout_eof(clip);
}

// Advance the state machine by stopping the clip and sending the EOF update
function advance() {
	ctlout_advance();
}

// Stop the clip
function stop() {
	ctlout_stop();
}

// OSC handler
function handleOSC(oscpath, args) {

	// var oldclip = clip;
	var newclip = 0;

	// Parse arguments:
	// ----------------
	// Single argument
	if (args.length == 1) {
		// Stop current video
		if (args[0] == 0) {
			newclip = clip;
			start = 0;
		}
		// Start specified clip (default: one-shot)
		else {
			newclip = args[0];
			start = 1;
		}
		loop = 0;
	}
	// Multple agruments
	else if (args.length > 1) {
		newclip = args[0];			// Specified clip
		start = args[1];			// Start/stop spec.
		loop = 0;
		if (args.length > 2) 		// Loop spec.
			loop = args[2];
	}

	// Start/Stop clips:
	// -----------------
	// If we're starting a video
	if (start && newclip) {

		// If there's a clip playing, fake an EOF to keep the state machine happy
		if (clip != 0) {		
			if (ctltype == 'video') 
				ctlout_advance();
			else 
				ctlout_eof(clip);
		}

		// Set loop mode and start the cliop
		ctlout_loop(loop);
		ctlout_start(oscpath, newclip, fileext);

		// Keep track of the clip we're playing until EOF
		path = oscpath;
		clip = newclip;			
	}
	else if (newclip == clip)
		ctlout_stop();
}

// End-of-file output handler
// --------------------------
// Sends an OSC message to the state machine, flagging this clip as played
function ctlout_eof(clipnum) {
	if (clipnum == 0)
		return;	 
	clip = 0;
	outlet(1, path, clipnum, 1);
}

// Set loop mode (same message for audio and video players)
function ctlout_loop(do_loop) {
	outlet(0, 'loop', do_loop);
}

// Video control output handlers:
// ------------------------------
// Start clip (video)
function ctlout_start_v(oscpath, clipnum, fileext) {
	outlet(0, 'read', fullpath(oscpath, clipnum, fileext));
}

// Stop clip (video)
function ctlout_stop_v() {
	outlet(0, 'dispose');
}

// Advance the clip (video)
function ctlout_advance_v() {
	outlet(0, 'stop');
	outlet(0, 'dispose');
}

// Audio control output handlers:
// ------------------------------
// Preload audio clips in the specified assets path. Each clip is set to its 
// number + 1, since sfplay~ plays whatever file is currently loaded on cue 1
function ctlout_preload_a(fnames) {	
	outlet(0, 'clear');
	for (var i = 0; i < fnames.length; i++) {
		post('preloading ' + fnames[i] + '\n');
		outlet(0, 'preload', i+2, fnames[i], 0);
	}
}

// Start clip (audio)
function ctlout_start_a(assetpath, clipnum, fext) {
	outlet(0, Number(clipnum) + 1);
}

// Stop clip (audio)
function ctlout_stop_a() {
	outlet(0, 0);
}
