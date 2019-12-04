/* ------------------------------------------------------------------------
 * gridctrl.js
 *
 * Front-end interface for controlling grid.maxpat
 *
 * Use with an assets directory containing images numbered 1, ..., 9
 * 
 * -------- Jeff Gregorio, 2019 -------------------------------------------
 *
 * Usage: 
 *	[js gridctrl.js [imgdir] [file_ext]]
 *
 * Examples:
 *	[js gridctrl.js assets/grid png]
 *
 * Responds to OSC messages conforming to:
 * 	/grid [index] [high/low]	
 *
 */

include("wtis_pathutil");

// Main 
// ====
inlets = 1;
outlets = 2;

// Default number of clips
var numclips = 9;
var assetpath = '/grid';
var fext = 'png';

// Fragment # to image position mapping
// var fragmap = [8, 4, 6, 3, 2, 0, 7, 1, 5]; 

// Get specified image directory
if (jsarguments.length > 1) {
	assetpath = jsarguments[1];
	// Add a leading slash if it's missing
	if (assetpath[0] !== '/')
		assetpath = '/' + assetpath;
}

// Get specified file extension
if (jsarguments.length > 2) {
	fext = jsarguments[2];
}

// Get a full path to the assets directory, and assume it contains 
// subdirectories '/bw' and '/color'
assetpath = fullpath('') + assetpath;
var highdir = assetpath + '/bw';
var lowdir = assetpath + '/color';

// Main message handler
function anything() {
	// Treat any string start with a slash as an OSC message
	if (messagename.charAt(0) == '/') 
		handleOSC(messagename, arguments);
}

// Preload files on loadbang or init
function loadbang() {
	ctlout_preload();
}

function init() {
	ctlout_preload();
}

// Show/hide the grid
function enable() {
	outlet(0, 0, 'enable', arguments[0]);
}

function kill() {
	outlet(0, 0, 'enable', 0);
}

// OSC handler
function handleOSC(oscpath, args) {
	
	if (args.length == 1) {
		outlet(0, 0, 'enable', args[0]);
	}

	else if (args.length == 2) {

		// Send grid location [1-9] to left outlet
		outlet(0, args[0]);

		// Send read [path] to the right outlet
		if (args[1] == 0)
			outlet(1, args[0], 'read', lowdir + '/' + args[0] + '.' + fext);
		else
			outlet(1, args[0], 'read', highdir + '/' + args[0] + '.' + fext);
	}
}

// Set position and scale for each [jit.gl.videoplane] and preload the
// file using the corresponding [jit.gl.movie]
function ctlout_preload() {

	var inscale = 0.830;		// Why? I have no idea
	var scale = inscale / 3.0;
	var spacing = 2.0 * inscale / 3.0;

	var x = -spacing;
	var y = spacing;

	for (var i = 0; i < numclips; i++) {

		outlet(0, (i+1), 'position', x, y, 0.0);
		outlet(0, (i+1), 'scale', scale, scale, 0.0);
		outlet(1, (i+1), 'read', lowdir + '/' + (i+1) + '.' + fext);

		if ((i+1) % 3 == 0) {
			x -= 2*spacing;
			y -= spacing;
		}
		else {
			x += spacing;
		}
	}
}

