/* ------------------------------------------------------------------------
 * assetctrl.js
 *
 * Maps incoming OSC messages to video/audio control callbacks
 * 
 * -------- Jeff Gregorio, 2019 -------------------------------------------
*/
function AssetController(cb_loop, cb_start, cb_stop, cb_advance, cb_eof) {

	var obj = {};

	// Current asset values
	obj.path;		// OSC path (same name as asset folder path)
	obj.clip = 0;	// Clip number

	// Handlers control outputs
	obj.cb_loop = cb_loop;
	obj.cb_start = cb_start;
	obj.cb_stop = cb_stop;
	obj.cb_advance = cb_advance;
	obj.cb_eof = cb_eof;

	// Handle kill message:
	// Stop the current asset, but first set the clip number to zero so the EOF
	// kicked back from the (a/v) player is ignored and we don't update the state
	// machine. If the state machine is sending 'kill' after a reset, at this point, 
	// it will already have cleared all flags, so we don't want to touch them. 
	obj.kill = function() {
		obj.clip = 0;
		obj.cb_stop();
	}

	// EOF handler
	obj.eof_in = function() {
		if (obj.clip != 0) {
			var oldclip = obj.clip;
			obj.clip = 0;
			obj.cb_eof(oldclip);
		}
	}

	// Advance handler
	obj.advance = function() {
		if (obj.clip != 0)
			obj.cb_advance(obj.clip);
	}

	// OSC handler
	obj.handle_osc = function(path, args) {

		var newclip;
		var start;
		var loop;

		// Parse arguments:
		// ----------------
		// Single argument
		if (args.length == 1) {
			// Stop current clip
			if (args[0] == 0) {
				newclip = obj.clip;
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

			// If there's a clip playing advance it
			if (obj.clip != 0)
				obj.advance();

			// Set loop mode and start the new clip
			obj.cb_loop(loop);
			obj.cb_start(path, newclip);

			// Keep track of the clip we're playing until EOF
			obj.path = oscpath;
			obj.clip = newclip;		
			return true;
		}
		else if (newclip == obj.clip)
			obj.cb_stop();

		return false;
	}

	return obj;
}
